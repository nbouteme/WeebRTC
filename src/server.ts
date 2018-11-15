import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as Static from 'koa-static';
import * as send from 'koa-send';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as crypto from 'crypto';
import * as path from 'path';

// let nginx handle this
// let HTTPS_PORT = 443;
const WebSocketServer = WebSocket.Server;

let config: { frontend: string, port: number } = { frontend: '.', port: 80 };

try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json')).toString());
} catch (e) {
    console.error(e);
    process.exit(1);
}

let HTTP_PORT = config.port || 80;

// let nginx handle the TLS layer
/*
const serverConfig = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
};
*/

let router = new Router();

router.get('*', (ctx, next) => send(ctx, 'index.html', { root: config.frontend }))

let app = new Koa()
    .use(Static(config.frontend))
    .use(router.routes())
    .use(router.allowedMethods());

/*const httpsServer = https
    .createServer(serverConfig, app.callback())
    .listen(HTTPS_PORT, '0.0.0.0');*/
const httpServer = http
    .createServer(app.callback())
    .listen(HTTP_PORT, '0.0.0.0', () => {
        console.log('Server started');
    });

//const wss = new WebSocketServer({ server: httpsServer });
const uwss = new WebSocketServer({ server: httpServer });

export enum CommandType {
    RequestToken,
    Join,
    Broadcast
}

type RequestTokenCommand = [CommandType.RequestToken, boolean];
type JoinCommand = [CommandType.Join, string];
type BroadcastCommand = [CommandType.Broadcast, string, string];
type Command = RequestTokenCommand | JoinCommand | BroadcastCommand;

let rooms = new Map<WebSocket, string>();
let availableroom = new Map<string, WebSocket[]>();

// Crypto, car Math.random est basé sur un GCL qui est prédictible lorsque les appels
// sont controllable par un attaquant.
let makeRandString = (l: number) => crypto.randomBytes(l).toString('hex');

let handleConnection = (ws: WebSocket) => {
    let room: string;
    // Pour éviter que les clients utilisent le serveur comme tiers pour échanger des données
    // un client émettant plus de 1024 octets sera automatiquement déconnecté.
    // TODO: Ban IP pour quelques secondes
    let remaining: number = 1024;

    ws.onclose = () => {
        rooms.delete(ws);
        let socks = availableroom.get(room);
        if (socks) {
            socks = socks.filter(s => s != ws);
            if (socks.length == 0)
                availableroom.delete(room)
            else
                availableroom.set(room, socks);
        }
    }

    ws.onmessage = m => {
        if (typeof m.data != "string")
            return;
        try {
            // Cast explicite, donc obligé de faire des vérifications manuelles sur
            // la validité des données
            let cmd = JSON.parse(m.data) as Command;
            if (!(cmd instanceof Array) || cmd.length < 2)
                throw new Error('Unexpected data type');
            if (cmd[0] == CommandType.RequestToken) {
                let rtc = cmd as RequestTokenCommand;
                if (typeof rtc[1] != 'boolean')
                    throw new Error('Unexpected data type');
                let rid: string;
                do {
                    rid = makeRandString(rtc[1] ? 8 : 4);
                } while (availableroom.has(rid));
                availableroom.delete(room);
                availableroom.set(rid, [ws]);
                rooms.set(ws, rid);
                room = rid;
                ws.send(JSON.stringify(rid));
            } else if (cmd[0] == CommandType.Join) {
                try {
                    let brd = cmd as JoinCommand;
                    if (typeof brd[1] != 'string')
                        throw new Error('Unexpected data type');
                    let socks = availableroom.get(brd[1]);
                    if (!socks)
                        throw new Error('Unknown room');
                    if (socks.includes(ws))
                        throw new Error('User is already in this room');
                    socks.push(ws);
                    availableroom.set(brd[1], socks);
                    ws.send('true');
                } catch (e) {
                    ws.send('false');
                    throw e;
                }
            } else if (cmd[0] == CommandType.Broadcast) {
                let brd = cmd as BroadcastCommand;
                if (typeof brd[1] != 'string' || typeof brd[2] != 'string')
                    throw new Error('Unexpected data type');
                let socks = availableroom.get(brd[1]);
                if (!socks)
                    throw new Error('Unknown room');
                if (!socks.includes(ws))
                    throw new Error('User did not join this room');
                remaining -= brd[2].length;
                if (remaining <= 0)
                    throw new Error('Data quota limit exceeded');
                socks.filter(s => s != ws)
                    .forEach(s => s.send(brd[2]));
            } else
                throw new Error('Malformed command');
        } catch (e) {
            console.log(e);
            ws.close();
        }
    };
}

//wss.on('connection', handleConnection);
uwss.on('connection', handleConnection);
