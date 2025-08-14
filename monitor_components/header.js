import blessed from "blessed";

export function createHeader(grid, screen, messageForHeader) {
  const bigText = grid.set(0, 7, 1, 2, blessed.box, {
    content: `{center}{bold}B u i d l G u i d l\nC l i e n t{/bold}{/center}`,
    tags: true,
    align: "center",
    valign: "top",
    style: {
      fg: "white",
      border: {
        fg: "cyan",
      },
    },
  });

  return { bigText };
}
