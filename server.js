import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* =====================================================
   CONFIG
   ===================================================== */

const UNIVERSE_ID = "9834925962";

/* =====================================================
   GAME STATS CACHE
   ===================================================== */

let gameStats = {
    likes: 0,
    dislikes: 0,
    visits: 0,
    favorites: 0,
    playing: 0,
    updatedAt: 0
};

/* =====================================================
   UPDATE GAME STATS
   ===================================================== */

async function updateGameStats() {

    try {

        /* =========================
           FETCH VOTES
           ========================= */

        const votesResponse = await fetch(
            `https://games.roblox.com/v1/games/votes?universeIds=${UNIVERSE_ID}`
        );

        if (!votesResponse.ok) {
            throw new Error(
                `Votes API error: ${votesResponse.status}`
            );
        }

        const votesData = await votesResponse.json();

        const votes = votesData?.data?.[0];

        /* =========================
           FETCH GAME INFO
           ========================= */

        const gameResponse = await fetch(
            `https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`
        );

        if (!gameResponse.ok) {
            throw new Error(
                `Games API error: ${gameResponse.status}`
            );
        }

        const gameData = await gameResponse.json();

        const game = gameData?.data?.[0];

        /* =========================
           UPDATE CACHE
           ========================= */

        gameStats = {
            likes: votes?.upVotes || 0,
            dislikes: votes?.downVotes || 0,

            visits: game?.visits || 0,
            favorites: game?.favoritedCount || 0,
            playing: game?.playing || 0,

            updatedAt: Date.now()
        };

        console.log("✅ Stats Updated:", gameStats);

    }
    catch (err) {

        console.error(
            "❌ Failed updating game stats:",
            err.message
        );

    }
}

/* =====================================================
   AUTO UPDATE STATS
   ===================================================== */

// Update immediately on startup
updateGameStats();

// Then update every 30 seconds
setInterval(updateGameStats, 30000);

/* =====================================================
   Endpoint: GET /stats
   ===================================================== */

app.get("/stats", (req, res) => {

    res.setHeader("Content-Type", "application/json");

    res.status(200).json(gameStats);

});

/* =====================================================
   Endpoint: GET /members?groupId=12345
   ===================================================== */

app.get("/members", async (req, res) => {

    const groupId = parseInt(req.query.groupId, 10);

    if (!groupId || isNaN(groupId)) {

        return res.status(400).json({
            error: "Missing or invalid groupId parameter"
        });

    }

    try {

        let cursor = "";

        const members = [];

        do {

            const url =
                `https://groups.roblox.com/v1/groups/${groupId}/users?sortOrder=Asc&limit=100${cursor ? `&cursor=${cursor}` : ""}`;

            const response = await fetch(url);

            if (!response.ok) {

                throw new Error(
                    `Roblox API error: ${response.status} ${response.statusText}`
                );

            }

            const data = await response.json();

            if (!data.data) break;

            members.push(...data.data);

            cursor = data.nextPageCursor;

        }
        while (cursor);

        res.setHeader("Content-Type", "application/json");

        res.status(200).json({
            groupId: groupId,
            totalMembers: members.length,
            members: members
        });

    }
    catch (err) {

        console.error(
            `Error fetching group ${groupId} members:`,
            err.message
        );

        res.status(500).json({
            error: "Failed to fetch members",
            details: err.message
        });

    }
});

/* =====================================================
   Endpoint: GET /group-icon?groupId=12345
   ===================================================== */

app.get("/group-icon", async (req, res) => {

    const groupId = parseInt(req.query.groupId, 10);

    if (!groupId || isNaN(groupId)) {

        return res.status(400).send(
            "Missing or invalid groupId"
        );

    }

    try {

        const thumbApi =
            `https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupId}&size=420x420&format=Png&isCircular=false`;

        const response = await fetch(thumbApi);

        if (!response.ok) {

            throw new Error(
                `Thumbnail API error: ${response.status}`
            );

        }

        const data = await response.json();

        const imageUrl = data?.data?.[0]?.imageUrl;

        if (!imageUrl) {

            return res.status(404).send(
                "Group icon not found"
            );

        }

        res.redirect(imageUrl);

    }
    catch (err) {

        console.error(
            `Error fetching group icon ${groupId}:`,
            err.message
        );

        res.status(500).send(
            "Failed to fetch group icon"
        );

    }
});

/* =====================================================
   START SERVER
   ===================================================== */

app.listen(PORT, () => {

    console.log(
        `✅ Proxy running on http://localhost:${PORT}`
    );

});
