import { Hono } from "hono";
import usersRoute from "./users";
import petsRoute from "./pets";
import devicesRoute from "./devices";
import statsRoute from "./stats";
import analyticsRoute from "./analytics";
import schedulesRoute from "./schedules";
import avatarsRoute from "./avatars";
import uploadsRoute from "./uploads";
import membershipsRoute from "./memberships";
import customizationRoute from "./customization";

const adminRoute = new Hono();

adminRoute.route("/", usersRoute);
adminRoute.route("/", petsRoute);
adminRoute.route("/", devicesRoute);
adminRoute.route("/", statsRoute);
adminRoute.route("/", analyticsRoute);
adminRoute.route("/", schedulesRoute);
adminRoute.route("/", avatarsRoute);
adminRoute.route("/", uploadsRoute);
adminRoute.route("/", membershipsRoute);
adminRoute.route("/", customizationRoute);

export default adminRoute;
