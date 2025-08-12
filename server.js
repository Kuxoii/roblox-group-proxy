import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Endpoint: GET /members?groupId=12345
app.get("/members", async (req, res) => {
    const groupId = parseInt(req.query.groupId, 10);

    if (!groupId || isNaN(groupId)) {
        return res.status(400).json({ error: "Missing or invalid groupId parameter" });
    }

    try {
        let cursor = "";
        const members = [];

        do {
            const url = `https://groups.roblox.com/v1/groups/${groupId}/users?sortOrder=Asc&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Roblox API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (!data.data) break;

            members.push(...data.data);
            cursor = data.nextPageCursor;
        } while (cursor);

        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
            groupId: groupId,
            totalMembers: members.length,
            members: members
        });

    } catch (err) {
        console.error(`Error fetching group ${groupId} members:`, err.message);
        res.status(500).json({ error: "Failed to fetch members", details: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Proxy running on http://localhost:${PORT}`);
});