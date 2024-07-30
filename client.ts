import {
  type RGBA,
  type DrawMessage,
  type EraseMessage,
  rgbaToCss,
  cssToRgba,
  serializeDraw,
  serializeErase,
  deserializeErase,
  MessageType,
  deserilaizeDraw,
  deserializeHello,
  HEIGHT,
  WIDTH,
  doDraw,
  clamp,
  doErase,
  GUMMI_SIZE,
  type ChatEntry,
  isChatEntry,
  type FillMessage,
  floodFill,
  toUint32,
  serializeFill,
  deserializeFill,
} from "./common";

const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.height = HEIGHT;
canvas.width = WIDTH;

const overlayCanvas = document.getElementById("overlay") as HTMLCanvasElement;
overlayCanvas.height = HEIGHT;
overlayCanvas.width = WIDTH;
overlayCanvas.setAttribute("data-mode", "pen");

const ws = new WebSocket("ws://localhost:6969");
ws.binaryType = "arraybuffer";

type Me = {
  id: number | undefined;
};
const me: Me = {
  id: undefined,
};

const colors: RGBA[] = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
  [150, 0, 255, 255],
  [0, 150, 255, 255],
  [150, 255, 255, 255],
];

console.log(colors.map(toUint32).map((a) => "#" + a.toString(16)));

const currentPencil = {
  drawingEnabled: false,
  mode: "pen",
  color: colors[0],
};

const chat: ChatEntry[] = [];

class ChatElement extends HTMLElement {
  chatBoxContainer: HTMLDivElement | null;
  constructor() {
    super();
    this.innerHTML = `<div class="chat-box"></div>
    <form class="message-box">
      <input type="text" placeholder="your message" />
      <button type="submit">Send</button>
    </form>`;

    const chatBox = this.getElementsByClassName("chat-box").item(0);
    if (!chatBox || !(chatBox instanceof HTMLDivElement)) throw new Error();
    this.chatBoxContainer = chatBox;

    const inputField = this.getElementsByTagName("input").item(0);
    if (!inputField || !(inputField instanceof HTMLInputElement))
      throw new Error();

    const form = this.getElementsByTagName("form").item(0);
    if (!form || !(form instanceof HTMLFormElement)) throw new Error();

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const value = inputField.value.trim();
      if (value.length > 0) {
        ws.send(
          JSON.stringify({
            type: MessageType.CHAT,
            message: value,
            timestamp: new Date().toUTCString(),
          }),
        );
        inputField.value = "";
      }
    });
  }

  addNewChatEntry(newEntry: ChatEntry) {
    chat.push(newEntry);

    const entry = document.createElement("div");

    switch (newEntry.from) {
      case -1:
        entry.className = "from-server";
        break;
      case me.id:
        entry.className = "from-me";
        break;
      default:
        entry.className = "from-someone";
        break;
    }
    entry.textContent = newEntry.message;

    this.chatBoxContainer?.appendChild(entry);
  }
}

customElements.define("chat-box", ChatElement);

const chatBox = document
  .getElementsByTagName("chat-box")
  .item(0) as ChatElement;

if (!chatBox || !(chatBox instanceof ChatElement))
  throw new Error("gimme chat box");

class ColorButtons extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = this.getColorButtons();
    this.querySelectorAll("button[data-color]").forEach((b) => {
      if (b instanceof HTMLButtonElement) {
        b.addEventListener("click", (e) => {
          const color = b.getAttribute("data-color");
          currentPencil.color = color ? cssToRgba(color) : colors[0];
          this.querySelector(
            "button[data-color][data-active]",
          )?.removeAttribute("data-active");
          b.setAttribute("data-active", "true");
        });
      }
    });
    this.querySelectorAll("button[data-mode]").forEach((modeToggleBtn) => {
      if (modeToggleBtn instanceof HTMLButtonElement) {
        modeToggleBtn.addEventListener("click", (e) => {
          const mode = modeToggleBtn.getAttribute("data-mode");
          currentPencil.mode = mode ?? "pen";
          this.querySelector("button[data-mode][data-active]")?.removeAttribute(
            "data-active",
          );
          modeToggleBtn.setAttribute("data-active", "true");
          overlayCanvas.setAttribute("data-mode", currentPencil.mode);
        });
      }
    });
  }
  getColorButtons() {
    let html = '<div class="button-bar">';
    for (let c of colors) {
      html += `<button type="button" class="color-block" data-color="${rgbaToCss(c)}" style="--color:${rgbaToCss(c)};" ${currentPencil.color === c ? 'data-active="true"' : ""}></button>`;
    }
    html += "</div>";
    html += '<div class="button-bar">';
    html += `<button type="button" class="mode-btn pen-btn" data-mode="pen" data-active="">pen</button>`;
    html += `<button type="button" class="mode-btn gummi-btn" data-mode="gummi">gummi</button>`;
    html += `<button type="button" class="mode-btn fill-btn" data-mode="fill">fill</button>`;
    html += "</div>";
    html += `<style>
    .color-block {
      display: inline-block;
      background-color: var(--color, lime);
      height: 32px;
      width: 32px;
      border: none;
    }
    .button-bar { 
      display: flex;
      margin: 16px 0;
      gap: 8px;
    }
    .mode-btn {
      background-color: transparent;
      border: 2px solid cyan;
      border-radius: 0;
      color: white;
      height: 32px;
      text-align: center;
      vertical-align: center;
    }
    button[data-active] {
      border: 2px solid white;
    }
    
  </style>`;
    return html;
  }
}
customElements.define("color-buttons", ColorButtons);

const ctx = canvas.getContext("2d")!;
const overlayCtx = overlayCanvas.getContext("2d")!;

let time = Date.now();

const mousePos = {
  x: 0,
  y: 0,
};

overlayCanvas.addEventListener("mousemove", (ev) => {
  mousePos.x = ev.offsetX;
  mousePos.y = ev.offsetY;
});

overlayCanvas.addEventListener("mousedown", (ev) => {
  mousePos.x = ev.offsetX;
  mousePos.y = ev.offsetY;
  currentPencil.drawingEnabled = true;
});
const finishDrawing = () => {
  currentPencil.drawingEnabled = false;
};

overlayCanvas.addEventListener("mouseup", finishDrawing);
overlayCanvas.addEventListener("mouseout", finishDrawing);

const lastMousePos = { x: 0, y: 0 };

let fillDebounce = false;

function frame() {
  const dt = Date.now() / time / 1000;

  overlayCtx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = rgbaToCss(currentPencil.color);
  ctx.lineWidth = 4;

  if (currentPencil.drawingEnabled) {
    if (currentPencil.mode === "pen") {
      const drawMessage: DrawMessage = {
        from: [lastMousePos.x, lastMousePos.y],
        to: [mousePos.x, mousePos.y],
        color: currentPencil.color,
      };
      doDraw(ctx, drawMessage);

      ws.send(serializeDraw(drawMessage));
    } else if (currentPencil.mode === "gummi") {
      const eraseMessage: EraseMessage = {
        at: [mousePos.x, mousePos.y],
      };
      doErase(ctx, eraseMessage);
      ws.send(serializeErase(eraseMessage));
    } else if (currentPencil.mode === "fill" && !fillDebounce) {
      const color = toUint32(currentPencil.color);
      const fillMessage: FillMessage = {
        at: [mousePos.x, mousePos.y],
        color,
      };

      floodFill(ctx, mousePos.x, mousePos.y, color);
      ws.send(serializeFill(fillMessage));
      fillDebounce = true;
      setTimeout(() => (fillDebounce = false), 500);
    }
  }
  if (currentPencil.mode === "gummi") {
    overlayCtx.strokeStyle = "hotpink";
    overlayCtx.beginPath();
    overlayCtx.arc(
      clamp(mousePos.x, GUMMI_SIZE, overlayCanvas.width - GUMMI_SIZE),
      clamp(mousePos.y, GUMMI_SIZE, overlayCanvas.height - GUMMI_SIZE),
      GUMMI_SIZE,
      0,
      360,
    );
    overlayCtx.stroke();

    overlayCtx.fillStyle = "rgba(100, 100, 100, 50%)";
    overlayCtx.beginPath();
    overlayCtx.arc(
      clamp(mousePos.x, GUMMI_SIZE, overlayCanvas.width - GUMMI_SIZE),
      clamp(mousePos.y, GUMMI_SIZE, overlayCanvas.height - GUMMI_SIZE),
      GUMMI_SIZE,
      0,
      360,
    );
    overlayCtx.fill();
  }
  if (currentPencil.mode === "pen") {
    overlayCtx.strokeStyle = "#181818";
    overlayCtx.fillStyle = rgbaToCss(currentPencil.color);
    overlayCtx.beginPath();
    overlayCtx.arc(mousePos.x, mousePos.y, 4, 0, 360);
    overlayCtx.stroke();
    overlayCtx.beginPath();
    overlayCtx.arc(mousePos.x, mousePos.y, 3, 0, 360);
    overlayCtx.fill();
  }

  lastMousePos.x = mousePos.x;
  lastMousePos.y = mousePos.y;
  requestAnimationFrame(frame);
}

ctx.fillStyle = "#181818";
ctx.fillRect(0, 0, canvas.width, canvas.height);
frame();

ws.addEventListener("open", (ev) => {
  console.log("open", ev);
});
ws.addEventListener("close", (ev) => {
  console.log("close", ev);
});
ws.addEventListener("error", (ev) => {
  console.log("error", ev);
});
ws.addEventListener("message", (ev) => {
  if (ev.data instanceof ArrayBuffer) {
    const view = new DataView(ev.data);

    const type = view.getUint8(0);
    if (type === MessageType.HELLO) {
      const helloMessage = deserializeHello(ev.data);
      me.id = helloMessage.id;

      const title = document.getElementsByTagName("h1").item(0);
      if (title && title.textContent) {
        title.textContent += helloMessage.id;
      }

      ctx.putImageData(helloMessage.imageData, 0, 0);
    } else if (type === MessageType.DRAW) {
      console.log("draw");
      const drawCommand = deserilaizeDraw(view);
      doDraw(ctx, drawCommand);
    } else if (type === MessageType.ERASE) {
      console.log("coffee");
      const erase = deserializeErase(view);
      doErase(ctx, erase);
    } else if (type === MessageType.FILL) {
      console.log("fill");
      const fill = deserializeFill(view);
      floodFill(ctx, fill.at[0], fill.at[1], fill.color);
    }
    return;
  } else if (typeof ev.data === "string") {
    const value = JSON.parse(ev.data);
    if (isChatEntry(value)) {
      chatBox.addNewChatEntry(value);
    }
  }
});
