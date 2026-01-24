import type { Express, Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./mcp_server.js";

export function mountRemoteMcp(app: Express) {
    const server = buildMcpServer();

    // sessionId -> transport (lié à une connexion SSE)
    const transports = new Map<string, StreamableHTTPServerTransport>();

    // 1) SSE : serveur -> client
    app.get("/mcp/sse", async (req: Request, res: Response) => {
        // Le client recevra un sessionId via le transport
        const sse = new SSEServerTransport("/mcp/messages", res);
        const httpTransport = new StreamableHTTPServerTransport({
            sessionId: sse.sessionId,
            sse,
        });

        const sessionId: string = httpTransport.sessionId ?? sse.sessionId;
        transports.set(sessionId, httpTransport);

        req.on("close", () => {
            transports.delete(sessionId);
            try {
                httpTransport.close?.();
            } catch {
                // ignore
            }
        });

        await server.connect(httpTransport);
    });

    // 2) POST messages : client -> serveur
    app.post("/mcp/messages", async (req: Request, res: Response) => {
        const sessionId = String(req.query.sessionId ?? "");
        if (!sessionId || !transports.has(sessionId)) {
            res.status(404).json({ error: "Unknown sessionId" });
            return;
        }

        const transport = transports.get(sessionId)!;

        // Le SDK sait parser/traiter la requête JSON-RPC
        await transport.handleRequest(req, res);
    });
}
