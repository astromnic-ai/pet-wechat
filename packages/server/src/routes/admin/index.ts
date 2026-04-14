import { Hono } from "hono";
import usersRoute from "./users";
import petsRoute from "./pets";
import devicesRoute from "./devices";
import statsRoute from "./stats";
import analyticsRoute from "./analytics";
import schedulesRoute from "./schedules";
import avatarsRoute from "./avatars";

export function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result as Partial<T>;
}

const adminRoute = new Hono();

adminRoute.route("/", usersRoute);
adminRoute.route("/", petsRoute);
adminRoute.route("/", devicesRoute);
adminRoute.route("/", statsRoute);
adminRoute.route("/", analyticsRoute);
adminRoute.route("/", schedulesRoute);
adminRoute.route("/", avatarsRoute);

export default adminRoute;
