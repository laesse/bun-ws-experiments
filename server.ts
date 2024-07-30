import {
  deserilaizeDraw,
  deserializeErase,
  doDraw,
  doErase,
  HEIGHT,
  MessageType,
  serializeHello,
  WIDTH,
  isChatMessage,
  type ChatMessage,
  type ChatEntry,
  floodFill,
  deserializeFill,
} from "./common";
import { createCanvas } from "@napi-rs/canvas";

let nextId = 0;
type User = {
  id: number;
};

const users = new Map<number, User>();

type WsContext = {
  user: User;
};

const canvas = createCanvas(WIDTH, HEIGHT);
// const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#181818";
ctx.fillRect(0, 0, canvas.width, canvas.height);

console.log("starting");

const chat: ChatEntry[] = [];

Bun.serve<WsContext>({
  port: "6969",
  fetch: (req, server) => {
    if (
      server.upgrade(req, {
        data: {
          user: {
            id: nextId++,
          },
        },
      })
    ) {
      return;
    }
    return new Response("upgrade failed", { status: 500 });
  },
  websocket: {
    open: (ws) => {
      users.set(ws.data.user.id, ws.data.user);
      console.log(`user ${ws.data.user.id} joined`);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const helloMessage = {
        id: ws.data.user.id,
        imageData,
      };
      ws.sendBinary(serializeHello(helloMessage));

      ws.sendText(
        JSON.stringify({
          message: "hello there welcome to the canvas",
          from: -1,
          type: MessageType.CHAT,
          timestamp: new Date().toUTCString(),
        } satisfies ChatEntry),
        true,
      );

      ws.subscribe("draw");
      ws.subscribe("chat");
    },
    close(ws, code, reason) {
      users.delete(ws.data.user.id);
      console.log(`user ${ws.data.user.id} left`);
    },
    message: (ws, message) => {
      if (message instanceof Buffer) {
        const view = new DataView(message.buffer);
        const messageType = view.getUint8(0);
        if (messageType === MessageType.DRAW) {
          doDraw(ctx, deserilaizeDraw(view));

          ws.publishBinary("draw", message);
        } else if (messageType === MessageType.ERASE) {
          doErase(ctx, deserializeErase(view));

          ws.publishBinary("draw", message);
        } else if (messageType === MessageType.FILL) {
          const value = deserializeFill(view);
          floodFill(ctx, value.at[0], value.at[1], value.color);

          ws.publishBinary("draw", message);
        }
      } else if (typeof message === "string") {
        const value = JSON.parse(message) as unknown;

        if (isChatMessage(value)) {
          const messageEntry = { ...value, from: ws.data.user.id };
          chat.push(messageEntry);
          ws.publishText("chat", JSON.stringify(messageEntry), true);
          ws.send(JSON.stringify(messageEntry), true);
        }
      }
    },
  },
});
