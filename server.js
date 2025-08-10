import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const GROUP_ID = 14114533; // Your Roblox group ID

// Allow JSON responses
app.use(express.json());

app.get("/members", async (req, res) => {
    try {
        let cursor = "";
        const members = [];

        do {
            const url = `https://groups.roblox.com/v1/groups/${GROUP_ID}/users?sortOrder=Asc&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Roblox API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.data) break; // Safety: exit if response is malformed

            members.push(...data.data);
            cursor = data.nextPageCursor;
        } while (cursor);

        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
            groupId: GROUP_ID,
            totalMembers: members.length,
            members: members
        });

    } catch (err) {
        console.error("Error fetching group members:", err.message);
        res.status(500).json({ error: "Failed to fetch members", details: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Proxy running on http://localhost:${PORT}`);
});