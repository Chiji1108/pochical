import { weekdayNames } from "../components/design-week";

// A picture sent in a chat, with its size so a line keeps its place
// before the picture loads; the apps get the size with the upload.
export type Photo = { src: string; width: number; height: number };

const rosterWidth = 800;
const rosterHeight = 600;

const rosterNames = ["佐藤", "田中", "ゆうき", "山本", "高橋", "伊藤", "中村"];
const rosterDays = 15;
const rosterShifts = ["日", "日", "夜", "明", "休", "日", "早", "休"];

// A month's roster from the ward, as someone would photograph the paper
// one and send it: drawn here so /design needs no real person's roster.
// Their own row is marked with a highlighter.
export function sampleRosterPhoto(): Photo {
  const left = 48;
  const nameWidth = 96;
  const top = 116;
  const cell = 40;
  const rowHeight = 56;
  const firstWeekday = 4;
  const header = Array.from({ length: rosterDays }, (_, index) => {
    const x = left + nameWidth + index * cell + cell / 2;
    const weekday = (firstWeekday + index) % 7;
    let color = "#333";
    if (weekday === 0) {
      color = "#c0392b";
    } else if (weekday === 6) {
      color = "#2c5aa0";
    }
    return `<text x="${x}" y="${top - 26}" fill="${color}" font-size="15" text-anchor="middle">${index + 1}</text><text x="${x}" y="${top - 8}" fill="${color}" font-size="11" text-anchor="middle">${weekdayNames[weekday]}</text>`;
  }).join("");
  const rows = rosterNames
    .map((name, row) => {
      const y = top + row * rowHeight;
      const cells = Array.from({ length: rosterDays }, (_, day) => {
        const shift = rosterShifts[(day + row * 3) % rosterShifts.length];
        const x = left + nameWidth + day * cell;
        const off =
          shift === "休"
            ? `<rect x="${x}" y="${y}" width="${cell}" height="${rowHeight}" fill="#eceae3"/>`
            : "";
        return `${off}<text x="${x + cell / 2}" y="${y + rowHeight / 2 + 7}" font-size="19" text-anchor="middle">${shift}</text>`;
      }).join("");
      const mark =
        name === "ゆうき"
          ? `<rect x="${left + 4}" y="${y + 14}" width="${nameWidth + rosterDays * cell - 8}" height="${rowHeight - 28}" rx="6" fill="#fff27a" opacity="0.55"/>`
          : "";
      return `${mark}<text x="${left + 14}" y="${y + rowHeight / 2 + 7}" font-size="19">${name}</text>${cells}`;
    })
    .join("");
  const bottom = top + rosterNames.length * rowHeight;
  const right = left + nameWidth + rosterDays * cell;
  const lines = [
    ...Array.from(
      { length: rosterNames.length + 1 },
      (_, row) =>
        `<line x1="${left}" x2="${right}" y1="${top + row * rowHeight}" y2="${top + row * rowHeight}"/>`
    ),
    ...Array.from(
      { length: rosterDays + 2 },
      (_, column) =>
        `<line x1="${column === 0 ? left : left + nameWidth + (column - 1) * cell}" x2="${column === 0 ? left : left + nameWidth + (column - 1) * cell}" y1="${top}" y2="${bottom}"/>`
    ),
  ].join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rosterWidth}" height="${rosterHeight}" viewBox="0 0 ${rosterWidth} ${rosterHeight}" font-family="sans-serif" fill="#2b2b2b"><rect width="100%" height="100%" fill="#d9d4c7"/><rect x="18" y="14" width="${rosterWidth - 36}" height="${rosterHeight - 24}" fill="#fbfaf5"/><text x="${left}" y="58" font-size="24" font-weight="700">2026年10月 勤務表</text><text x="${right}" y="58" font-size="15" text-anchor="end">5階東病棟</text>${header}${rows}<g stroke="#9a968c" stroke-width="1">${lines}</g></svg>`;
  return {
    height: rosterHeight,
    src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    width: rosterWidth,
  };
}
