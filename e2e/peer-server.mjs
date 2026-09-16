/** 本地 PeerJS 信令服务器：给跨浏览器 / 跨机器联机测试用（不参与生产部署）。 */
import { PeerServer } from "peer";

const port = Number(process.env.PEER_PORT ?? 9100);
const path = process.env.PEER_PATH ?? "/";
const server = PeerServer({ port, path, allow_discovery: false });
server.on("connection", (client) => {
  console.log(`[peer-server] client connected: ${client.getId()}`);
});
console.log(`[peer-server] listening on ws://127.0.0.1:${port}${path} (key: peerjs)`);
