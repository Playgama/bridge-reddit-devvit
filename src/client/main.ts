import {
  IncrementResponse,
  DecrementResponse,
  InitResponse,
} from "../shared/types/api";
import { navigateTo } from "@devvit/web/client";

const counterValueElement = document.getElementById(
  "counter-value"
) as HTMLSpanElement | null;
const incrementButton = document.getElementById(
  "increment-button"
) as HTMLButtonElement | null;
const decrementButton = document.getElementById(
  "decrement-button"
) as HTMLButtonElement | null;

const docsLink = document.getElementById("docs-link") as HTMLDivElement | null;
const playtestLink = document.getElementById("playtest-link") as HTMLDivElement | null;
const discordLink = document.getElementById("discord-link") as HTMLDivElement | null;

if (docsLink) {
  docsLink.addEventListener("click", () => {
    navigateTo("https://developers.reddit.com/docs");
  });
}

if (playtestLink) {
  playtestLink.addEventListener("click", () => {
    navigateTo("https://www.reddit.com/r/Devvit");
  });
}

if (discordLink) {
  discordLink.addEventListener("click", () => {
    navigateTo("https://discord.com/invite/R7yu2wh9Qz");
  });
}

const titleElement = document.getElementById("title") as HTMLHeadingElement | null;

export let currentPostId: string | null = null;

export async function fetchInitialCount() {
  try {
    const response = await fetch("/api/init");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as InitResponse;
    if (data.type === "init") {
      if (counterValueElement) counterValueElement.textContent = data.count.toString();
      currentPostId = data.postId; // Store postId for later use
      if (titleElement) titleElement.textContent = `Hey ${data.username} 👋`;
    } else {
      console.error("Invalid response type from /api/init", data);
      if (counterValueElement) counterValueElement.textContent = "Error";
    }
  } catch (error) {
    console.error("Error fetching initial count:", error);
    if (counterValueElement) counterValueElement.textContent = "Error";
  }
}

export async function updateCounter(action: "increment" | "decrement") {
  if (!currentPostId) {
    console.error("Cannot update counter: postId is not initialized.");
    return;
  }

  try {
    const response = await fetch(`/api/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as
      | IncrementResponse
      | DecrementResponse;
    if (counterValueElement) counterValueElement.textContent = data.count.toString();
  } catch (error) {
    console.error(`Error ${action}ing count:`, error);
  }
}

if (incrementButton) incrementButton.addEventListener("click", () => updateCounter("increment"));
if (decrementButton) decrementButton.addEventListener("click", () => updateCounter("decrement"));

// Fetch the initial count when the page loads (only if UI exists)
if (counterValueElement) fetchInitialCount();

// Expose a minimal API on window under `reddit`
;(window as any).reddit = {
  fetchInitialCount,
  updateCounter,
  get currentPostId() {
    return currentPostId;
  },
};
