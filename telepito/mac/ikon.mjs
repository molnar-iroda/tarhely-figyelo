// A macOS-alkalmazás ikonja (1024x1024 PNG) a projekt saját rajzoló csomagjával.
// Futtatás: node telepito/mac/ikon.mjs telepito/mac/ikon.png
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

const S = 1024;
const canvas = createCanvas(S, S);
const c = canvas.getContext("2d");

function rounded(x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

rounded(100, 100, S - 200, S - 200, 190);
c.fillStyle = "#1f4e8c";
c.fill();

rounded(250, 360, 524, 330, 34);
c.fillStyle = "#ffffff";
c.fill();
c.strokeStyle = "#1f4e8c";
c.lineWidth = 26;
c.lineJoin = "round";
c.lineCap = "round";
c.beginPath();
c.moveTo(270, 388);
c.lineTo(512, 560);
c.lineTo(754, 388);
c.stroke();

c.beginPath();
c.arc(690, 690, 120, 0, Math.PI * 2);
c.fillStyle = "#1a7f45";
c.fill();
c.lineWidth = 18;
c.strokeStyle = "#ffffff";
c.stroke();
c.lineWidth = 30;
c.beginPath();
c.moveTo(636, 694);
c.lineTo(676, 736);
c.lineTo(748, 648);
c.stroke();

writeFileSync(process.argv[2] ?? "ikon.png", canvas.toBuffer("image/png"));
