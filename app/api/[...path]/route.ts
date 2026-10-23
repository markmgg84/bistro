import { get, post, failure } from "../../../lib/server/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    return await get(request, (await context.params).path);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    return await post(request, (await context.params).path);
  } catch (error) {
    return failure(error);
  }
}
