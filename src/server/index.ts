import express from "express";
import {
  InitResponse,
  IncrementResponse,
  DecrementResponse,
} from "../shared/types/api";
import {
  createServer,
  context,
  getServerPort,
  reddit,
  redis,
} from "@devvit/web/server";
import { createPost } from "./core/post";

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

// Storage helpers for platform_internal storage using Redis
// - Supports single key or array of keys
// - Mirrors client expectations: await-based API with strict validation
export const setDataToStorage = async (
  key: string | string[],
  value: unknown | unknown[]
): Promise<void> => {
  if (Array.isArray(key)) {
    if (!Array.isArray(value)) {
      throw new Error("Value must be an array if key is an array");
    }
    if (key.length !== value.length) {
      throw new Error("Key and value arrays must have the same length");
    }

    await Promise.all(
      key.map((k, i) => redis.set(String(k), String(value[i])))
    );
    return;
  }

  await redis.set(String(key), String(value as unknown as string));
};

export const getDataFromStorage = async (
  key: string | string[]
): Promise<string | (string | null)[] | null> => {
  if (Array.isArray(key)) {
    const values = await Promise.all(key.map((k) => redis.get(String(k))));
    return values.map((v) => (v ?? null)); // (string | null)[]
  }

  const value = await redis.get(String(key));
  return value ?? null;
};

export const deleteDataFromStorage = async (
  key: string | string[]
): Promise<void> => {
  if (Array.isArray(key)) {
    await Promise.all(key.map((k) => redis.del(String(k))));
    return;
  }

  await redis.del(String(key));
};

router.get<
  { postId: string },
  InitResponse | { status: string; message: string }
>("/api/init", async (_req, res): Promise<void> => {
  const { postId } = context;

  if (!postId) {
    console.error("API Init Error: postId not found in devvit context");
    res.status(400).json({
      status: "error",
      message: "postId is required but missing from context",
    });
    return;
  }

  try {
    const [count, username] = await Promise.all([
      redis.get("count"),
      reddit.getCurrentUsername(),
    ]);

    res.json({
      type: "init",
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? "anonymous",
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = "Unknown error during initialization";
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    res.status(400).json({ status: "error", message: errorMessage });
  }
});

router.post<
  { postId: string },
  IncrementResponse | { status: string; message: string },
  unknown
>("/api/increment", async (_req, res): Promise<void> => {
  const { postId } = context;
  if (!postId) {
    res.status(400).json({
      status: "error",
      message: "postId is required",
    });
    return;
  }

  res.json({
    count: await redis.incrBy("count", 1),
    postId,
    type: "increment",
  });
});

router.post<
  { postId: string },
  DecrementResponse | { status: string; message: string },
  unknown
>("/api/decrement", async (_req, res): Promise<void> => {
  const { postId } = context;
  if (!postId) {
    res.status(400).json({
      status: "error",
      message: "postId is required",
    });
    return;
  }

  res.json({
    count: await redis.incrBy("count", -1),
    postId,
    type: "decrement",
  });
});

router.post("/internal/on-app-install", async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: "success",
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: "error",
      message: "Failed to create post",
    });
  }
});

router.post("/internal/menu/post-create", async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: "error",
      message: "Failed to create post",
    });
  }
});

app.use(router);

const server = createServer(app);
server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(getServerPort());

// Expose minimal REST API for storage helpers
// Allows client scripts to call via window-exposed wrappers
router.post(
  "/api/storage/get",
  async (req, res): Promise<void> => {
    try {
      const { key } = req.body as { key?: string | string[] };
      if (typeof key === "undefined") {
        res.status(400).json({ status: "error", message: "key is required" });
        return;
      }
      const data = await getDataFromStorage(key);
      res.json({ status: "ok", data });
    } catch (error) {
      console.error("/api/storage/get error", error);
      res.status(500).json({ status: "error", message: "failed to get data" });
    }
  }
);

router.post(
  "/api/storage/set",
  async (req, res): Promise<void> => {
    try {
      const { key, value } = req.body as {
        key?: string | string[];
        value?: unknown | unknown[];
      };
      if (typeof key === "undefined") {
        res.status(400).json({ status: "error", message: "key is required" });
        return;
      }
      if (typeof value === "undefined") {
        res
          .status(400)
          .json({ status: "error", message: "value is required" });
        return;
      }
      await setDataToStorage(key, value);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("/api/storage/set error", error);
      res.status(500).json({ status: "error", message: "failed to set data" });
    }
  }
);

router.post(
  "/api/storage/delete",
  async (req, res): Promise<void> => {
    try {
      const { key } = req.body as { key?: string | string[] };
      if (typeof key === "undefined") {
        res.status(400).json({ status: "error", message: "key is required" });
        return;
      }
      await deleteDataFromStorage(key);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("/api/storage/delete error", error);
      res
        .status(500)
        .json({ status: "error", message: "failed to delete data" });
    }
  }
);