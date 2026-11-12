import { loginHandler } from "@/lib/login";

export const POST = (req: Request) => loginHandler(req, "staff");
