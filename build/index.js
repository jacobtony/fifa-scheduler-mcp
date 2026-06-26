import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// Create server instance
const server = new McpServer({
    name: "fifaScheduler",
    version: "1.0.0",
}, {
    // Capabilities advertised by this server during initialization.
    // Note: `elicitation` is a CLIENT capability and cannot be declared here.
    capabilities: {
        tools: { listChanged: true },
        logging: {},
    },
});
server.registerTool('create_match_event', {
    description: "Create a match event for the match in the world cup and send to the mail of the recipient",
    inputSchema: {
        favoriteTeam: z.string().optional().describe("Favorite team of the user (used when the client can't render a form)"),
        recipientEmail: z.string().optional().describe("Email of the recipient (used when the client can't render a form)"),
        minutesRemaining: z.number().optional().describe("Minutes remaining before the match starts (used when the client can't render a form)"),
    },
}, async ({ favoriteTeam, recipientEmail, minutesRemaining }) => {
    let team;
    let userName;
    let reminderMinutes;
    // Form elicitation requires the client to advertise support for it.
    const supportsFormElicitation = !!server.server.getClientCapabilities()?.elicitation?.form;
    if (supportsFormElicitation) {
        // Collect (or confirm) all inputs from the user as a form.
        const elicitation = await server.server.elicitInput({
            mode: "form",
            message: "Enter the details for your World Cup match event.",
            requestedSchema: {
                type: "object",
                properties: {
                    email: {
                        type: "string",
                        title: "Recipient email",
                        description: "The email of the recipient.",
                        minLength: 1,
                        default: recipientEmail ?? "jacobtony994@gmail.com",
                    },
                    reminderMinutes: {
                        type: "integer",
                        title: "Reminder (minutes before kickoff)",
                        description: "How many minutes before the match to be reminded.",
                        minimum: 0,
                        maximum: 1440,
                        default: minutesRemaining ?? 60,
                    },
                    favoriteTeam: {
                        type: "string",
                        title: "Favorite team",
                        description: "The team whose match you want an event for.",
                        minLength: 1,
                        default: favoriteTeam ?? "Argentina",
                    },
                },
                required: ["email", "reminderMinutes", "favoriteTeam"],
            },
        });
        if (elicitation.action !== "accept" || !elicitation.content) {
            return {
                content: [{
                        type: "text",
                        text: "Match event creation was cancelled.",
                    }],
            };
        }
        team = elicitation.content.favoriteTeam;
        recipientEmail = elicitation.content.email;
        reminderMinutes = elicitation.content.reminderMinutes;
    }
    else {
        // Email can only be collected via the form, so form support is required.
        return {
            content: [{
                    type: "text",
                    text: "This client doesn't support form input, which is required to collect the recipient email. Please use a client that supports MCP form elicitation.",
                }],
            isError: true,
        };
    }
    try {
        const response = await fetch('http://localhost:3000/create-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ favoriteTeam: team, email: recipientEmail, reminderMinutes }),
        });
        if (!response.ok) {
            console.error('Create-event request failed:', response.status, response.statusText);
            return {
                content: [{
                        type: "text",
                        text: `Failed to create the match event (server responded ${response.status}).`,
                    }],
                isError: true,
            };
        }
        const data = await response.json();
        console.error('Match event created:', data);
    }
    catch (error) {
        console.error('Error creating match event:', error);
        return {
            content: [{
                    type: "text",
                    text: 'Failed to create the match event. Please try again later.',
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: "text",
                text: `Match event for ${team} created and sent to ${recipientEmail} with a ${reminderMinutes}-minute reminder.`,
            }],
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("FIFA Scheduler MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
