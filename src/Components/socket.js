import { Socket } from "socket.io-client";
const socket=new Socket("http://localhost:3000", {
  transports: ["websocket"], 
});
export default socket;