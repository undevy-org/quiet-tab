import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWidgetsService } from "../src/widgetsService.js";
import { createWidgetsStore } from "../src/widgetsStore.js";
import { createMemoryStorageArea } from "./memoryStorageArea.js";

const NOW = "2026-10-07T10:00:00.000Z";

describe("widgetsService.addFavorites", () => {
  it("adds multiple favorites in one mutate and dedupes existing URLs", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const service = createWidgetsService({ store, now: () => NOW, createId: () => `id-${Math.random()}` });
    await store.setState({
      version: 3,
      items: [
        {
          id: "f1",
          type: "favorite",
          url: "https://chatgpt.com/",
          label: "ChatGPT",
          domain: "chatgpt.com",
          iconMode: "favicon",
          customIconUrl: null,
          backgroundColor: "#24292f",
          backgroundColorSource: "auto",
          grid: { x: 0, y: 0, w: 2, h: 1 },
          createdAt: NOW,
          updatedAt: NOW
        }
      ],
      createdAt: NOW,
      updatedAt: NOW
    });
    const added = await service.addFavorites(
      [
        { url: "https://chatgpt.com/", label: "ChatGPT", w: 2, h: 1 },
        { url: "https://github.com/", label: "GitHub", w: 2, h: 1 }
      ],
      { columns: 12 }
    );
    assert.equal(added.length, 1);
    const state = await service.getState();
    assert.equal(state.items.filter((item) => item.type === "favorite").length, 2);
  });
});
