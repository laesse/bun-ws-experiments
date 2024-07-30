export const HEIGHT = 600;
export const WIDTH = 800;
export const GUMMI_SIZE = 20;

import type { SKRSContext2D } from "@napi-rs/canvas";

export enum MessageType {
  HELLO,
  DRAW,
  ERASE,
  FILL,
  CHAT,
}

/**
 * represents x and y
 */
export type Vec2 = [number, number];
const vec2Zero = (): Vec2 => [0, 0];

export type RGBA = [number, number, number, number];

export const rgbaToCss = (rgba: RGBA) =>
  `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${Math.floor((rgba[3] / 255) * 100)}%)`;

const rgbaRegex =
  /^rgba\(([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)%/g;

export const cssToRgba = (cssStr: string): RGBA => {
  const result = [...cssStr.matchAll(rgbaRegex)]
    .flat()
    .map((el, i) => (i !== 0 ? Number(el) : null))
    .filter((a) => a !== null);

  if (result.length !== 4) {
    throw new Error("kafi");
  }
  // percentage to range from 0-255
  result[3] = Math.floor((result[3] / 100) * 255);

  return result as RGBA;
};

const serializeVec2 = (view: DataView, byteOffset: number, vec: Vec2) => {
  view.setFloat32(byteOffset, vec[0]);
  view.setFloat32(byteOffset + 4, vec[1]);
  return 8;
};
const deserializeVec2 = (view: DataView, byteOffset: number): Vec2 => {
  return [view.getFloat32(byteOffset), view.getFloat32(byteOffset + 4)];
};
const serializeRGBA = (view: DataView, byteOffset: number, vec: RGBA) => {
  view.setUint8(byteOffset, vec[0]);
  view.setUint8(byteOffset + 1, vec[1]);
  view.setUint8(byteOffset + 2, vec[2]);
  view.setUint8(byteOffset + 3, vec[3]);
  return 4;
};
export const toUint32 = (vec: RGBA) => {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  serializeRGBA(view, 0, vec);

  return view.getUint32(0, true);
};

const deserializeRGBA = (view: DataView, byteOffset: number): RGBA => {
  return [
    view.getUint8(byteOffset),
    view.getUint8(byteOffset + 1),
    view.getUint8(byteOffset + 2),
    view.getUint8(byteOffset + 3),
  ];
};

export type HelloMessage = {
  id: number;
  imageData: ImageData;
};

export const serializeHello = (message: HelloMessage) => {
  const imgDataLen = message.imageData.data.byteLength;
  const buffer = new ArrayBuffer(1 + 4 + 2 + 2 + imgDataLen);
  const view = new DataView(buffer);
  const view2 = new Uint8Array(buffer);
  view.setUint8(0, MessageType.HELLO);
  view.setUint32(1, message.id);
  view.setUint16(5, message.imageData.width);
  view.setUint16(7, message.imageData.height);
  view2.set(message.imageData.data, 9);
  return buffer;
};
export const deserializeHello = (buffer: ArrayBuffer): HelloMessage => {
  const view = new DataView(buffer);
  const view2 = new Uint8ClampedArray(buffer.slice(9));
  if (view.getUint8(0) !== MessageType.HELLO) throw new Error("not hello type");
  return {
    id: view.getUint32(1),
    imageData: new ImageData(view2, view.getUint16(5), view.getUint16(7)),
  };
};

export type DrawMessage = {
  from: Vec2;
  to: Vec2;
  color: RGBA;
};
export const serializeDraw = (message: DrawMessage) => {
  const buffer = new ArrayBuffer(1 + 8 + 8 + 4);
  const view = new DataView(buffer);
  view.setUint8(0, MessageType.DRAW);
  serializeVec2(view, 1, message.from);
  serializeVec2(view, 9, message.to);
  serializeRGBA(view, 17, message.color);
  return buffer;
};
export const deserilaizeDraw = (view: DataView) => {
  if (view.getUint8(0) !== MessageType.DRAW) throw new Error("not draw type");
  return {
    from: deserializeVec2(view, 1),
    to: deserializeVec2(view, 9),
    color: deserializeRGBA(view, 17),
  };
};
export type EraseMessage = {
  at: Vec2;
};
export const serializeErase = (message: EraseMessage) => {
  const buffer = new ArrayBuffer(1 + 8);
  const view = new DataView(buffer);
  view.setUint8(0, MessageType.ERASE);
  serializeVec2(view, 1, message.at);
  return buffer;
};
export const deserializeErase = (view: DataView): EraseMessage => {
  if (view.getUint8(0) !== MessageType.ERASE) throw new Error("not erase type");
  return {
    at: deserializeVec2(view, 1),
  };
};
export type FillMessage = {
  color: number; // rgba but just a single uint32
  at: Vec2;
};
export const serializeFill = (message: FillMessage) => {
  const buffer = new ArrayBuffer(1 + 4 + 8);
  const view = new DataView(buffer);
  view.setUint8(0, MessageType.FILL);
  view.setUint32(1, message.color);
  serializeVec2(view, 5, message.at);
  return buffer;
};
export const deserializeFill = (view: DataView): FillMessage => {
  if (view.getUint8(0) !== MessageType.FILL) throw new Error("not fill type");
  return {
    color: view.getUint32(1),
    at: deserializeVec2(view, 5),
  };
};

export const clamp = (val: number, lo: number, up: number) =>
  val < lo ? lo : val > up ? up : val;

export const doErase = (
  ctx: CanvasRenderingContext2D | SKRSContext2D,
  erase: EraseMessage,
) => {
  ctx.fillStyle = "#181818";
  ctx.beginPath();
  ctx.arc(
    clamp(erase.at[0], GUMMI_SIZE, ctx.canvas.width - GUMMI_SIZE),
    clamp(erase.at[1], GUMMI_SIZE, ctx.canvas.height - GUMMI_SIZE),
    GUMMI_SIZE,
    0,
    360,
  );
  ctx.fill();
};

export const doDraw = (
  ctx: CanvasRenderingContext2D | SKRSContext2D,
  drawCommand: DrawMessage,
) => {
  ctx.strokeStyle = rgbaToCss(drawCommand.color);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(drawCommand.from[0], drawCommand.from[1]);
  ctx.lineTo(drawCommand.to[0], drawCommand.to[1]);
  ctx.stroke();
};

type Span = { left: number; right: number; y: number; dir: number };

export const floodFill = (
  ctx: CanvasRenderingContext2D | SKRSContext2D,
  x: number,
  y: number,
  fillColor: number,
) => {
  const imgData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const view = new Uint32Array(imgData.data.buffer);
  const getPixel = (x: number, y: number) => view.at(x + WIDTH * y);

  const targetColor = getPixel(x, y);
  const tolerance = 128;
  if (fillColor === targetColor) return;

  const stack: Span[] = [];

  const pixelCompare = (pixel: number | undefined) => {
    const A_mask = 0xff,
      B_mask = 0x00ff,
      G_mask = 0x0000ff,
      R_mask = 0x000000ff;

    if (pixel === targetColor) {
      return true;
    }
    if (
      pixel &&
      targetColor &&
      Math.abs(pixel & (A_mask - targetColor) & A_mask) <= tolerance &&
      Math.abs(pixel & (R_mask - targetColor) & R_mask) <= tolerance &&
      Math.abs(pixel & (G_mask - targetColor) & G_mask) <= tolerance &&
      Math.abs(pixel & (B_mask - targetColor) & B_mask) <= tolerance
    ) {
      return true;
    }
    return false;
  };

  const checkSpan = ({ left, right, y, dir }: Span) => {
    let inSpan = false;
    let start: number = 0;
    let x: number;
    for (x = left; x < right; ++x) {
      const pixel = getPixel(x, y);
      if (pixelCompare(pixel)) {
        if (!inSpan) {
          inSpan = true;
          start = x;
        }
      } else {
        if (inSpan) {
          inSpan = false;
          stack.push({ left: start, right: x - 1, y, dir });
        }
      }
    }
    if (inSpan) {
      inSpan = false;
      stack.push({ left: start, right: x - 1, y, dir });
    }
  };

  stack.push({ left: x, right: x, y, dir: 0 });

  while (stack.length > 0) {
    const { left, right, y, dir } = stack.pop()!;
    let l = left;
    for (;;) {
      --l;
      const pix = getPixel(l, y);
      if (!pixelCompare(pix)) break;
      if (l < 0) break;
    }
    ++l;

    let r = right;
    for (;;) {
      ++r;
      const pix = getPixel(r, y);
      if (!pixelCompare(pix)) break;
      if (r >= WIDTH) break;
    }

    const lineOffset = y * WIDTH;
    view.fill(fillColor, lineOffset + l, lineOffset + r);
    if (dir <= 0) {
      checkSpan({ left: l, right: r, y: y - 1, dir: -1 });
    } else {
      checkSpan({ left: l, right: left, y: y - 1, dir: -1 });
      checkSpan({ left: right, right: r, y: y - 1, dir: -1 });
    }
    if (dir >= 0) {
      checkSpan({ left: l, right: r, y: y + 1, dir: 1 });
    } else {
      checkSpan({ left: l, right: left, y: y + 1, dir: 1 });
      checkSpan({ left: right, right: r, y: y + 1, dir: 1 });
    }
  }
  ctx.putImageData(imgData, 0, 0);
};

export const floodFill2 = (
  ctx: CanvasRenderingContext2D | SKRSContext2D,
  x: number,
  y: number,
  color: RGBA,
) => {
  const imgData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const view = new Uint32Array(imgData.data.buffer);
  const getPixel = (x: number, y: number) => view.at(x + WIDTH * y);

  ctx.putImageData(imgData, 0, 0);
};

export type ChatMessage = {
  type: MessageType.CHAT;
  message: string;
  timestamp: string;
};
export type ChatEntry = ChatMessage & { from: number };

export const isChatMessage = (message: unknown): message is ChatMessage => {
  return (
    !!message &&
    typeof message === "object" &&
    "type" in message &&
    "message" in message &&
    "timestamp" in message &&
    message.type === MessageType.CHAT &&
    typeof message.message === "string" &&
    typeof message.timestamp === "string"
  );
};
export const isChatEntry = (message: unknown): message is ChatEntry => {
  return (
    isChatMessage(message) &&
    "from" in message &&
    typeof message.from === "number"
  );
};
