WeebRTC
=======

WebRTC signalling server to use with WeebRTC
front end.

## Installation

`npm i && npm run build`

## Configuration

There should be a config.json file at the root of the repo when running.
The root object can contain the following keys:

|Key|Type|Required|Description|
|-|-|-|-|
|frontend|string|Yes|Path to a static site to serve|
|port|number|No|Port on which to serve files and run the websocket server|
## Running

`node ./dist/server.js`

May need to run as root to bind to port 443, for HTTPS.

Or use a reverse proxy.

## How does it works

It's basically a glorified chatroom.
Each new connection gets their own room, with a long or short identifier depending on what

| Command ID | Command Name | Arguments | Description |
|-|-|-|-|
|0|Create Room|[boolean]|Replies with a room ID as a string. You're automatically logged into the room. True if you want a long room ID, false otherwise.
|1|Join Room|[string]| Join a room, replies with false if the room is full, or doesn't exist, or if you're already in the room. True otherwise|
|2|Broadcast room|[string, string]|First argument is a room ID, second argument is the message to broadcast. Everyone in the room will receive the message|

Only two connections are allowed at once in a room, and there's a hard limit of 2kb of maximum data a connection can broadcast, after which the connection will be closed. It should be enough for peer signalling each other.
