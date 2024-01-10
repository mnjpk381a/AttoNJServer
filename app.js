import express from "express";
const { json, urlencoded } = express;
import { createServer } from "http";
import { Server } from "socket.io";
import { Dropbox } from "dropbox";
import multer, { memoryStorage } from "multer";
import fetch from "node-fetch";
import shortid from "shortid";
import bodyParser from "body-parser";
import request from "request";

const app = express();
const port = 3000;
app.use(json());
app.use(urlencoded({ extended: true }));

// app = initializeRoutes(app);
app.get("/", (req, res) => {
  res.status(200).send({
    success: true,
    message: "welcome to the beginning of greatness",
  });
});
////Usman's Code
const config = {
  fetch,
  clientId: "c5hkdcx9to6ox39",
  clientSecret: "6d4x7dl6hmdxk4o",
  tokenAccessType: "offline",
};

const dbx = new Dropbox(config);

const storage = memoryStorage();
const upload = multer({ storage: storage });

let accessToken = null;

app.post("/upload", upload.array("file", 10), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Ensure a valid access token (refresh if expired)
    accessToken = await ensureAccessToken();

    // Upload files to Dropbox
    const uploadPromises = files.map((file) =>
      uploadToDropbox(file, accessToken)
    );
    const uploadResponses = await Promise.all(uploadPromises);

    return res.json({ success: true, data: uploadResponses });
  } catch (error) {
    console.error("Error uploading files to Dropbox:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const ensureAccessToken = async () => {
  if (!accessToken) {
    accessToken = await getAccessToken();
  } else {
    try {
      // Check if the access token is still valid
      await dbx.usersGetCurrentAccount({ accessToken });
    } catch (error) {
      if (error.error?.error?.[".tag"] === "expired_access_token") {
        // If the access token is expired, refresh it
        accessToken = await refreshAccessToken();
      }
    }
  }

  return accessToken;
};

const getAccessToken = async () => {
  try {
    // Use the 'code' response type
    const authUrl = await dbx.auth.getAuthenticationUrl(
      "http://localhost:3000/auth",
      null,
      "code",
      "offline",
      null,
      "none",
      false
    );

    console.log("Please visit this URL to authorize the app:", authUrl);

    return new Promise((resolve, reject) => {
      app.get("/auth", async (req, res) => {
        const { code } = req.query;

        try {
          const tokenResponse = await dbx.auth.getAccessTokenFromCode(
            "http://localhost:3000/auth",
            code
          );

          const newAccessToken = tokenResponse.result.access_token;
          console.log("Access Token:", newAccessToken);
          res.send("Authorization successful. You can close this window now.");

          resolve(newAccessToken);
        } catch (error) {
          console.error("Error exchanging code for access token:", error);
          res.status(500).send("Error authorizing the app.");
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error("Error generating authentication URL:", error);
    throw error;
  }
};

const refreshAccessToken = async () => {
  try {
    const refreshResponse = await dbx.auth.refreshAccessToken();
    const newAccessToken = refreshResponse.result.access_token;
    console.log("Refreshed Access Token:", newAccessToken);
    return newAccessToken;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    throw error;
  }
};

const uploadToDropbox = async (file, accessToken) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/octet-stream",
    "Dropbox-API-Arg": JSON.stringify({
      path: `/uploads/${file.originalname}`,
      mode: "add",
      autorename: true,
      mute: false,
    }),
  };

  const uploadUrl = "https://content.dropboxapi.com/2/files/upload";

  return await fetch(uploadUrl, {
    method: "POST",
    headers,
    body: file.buffer,
  }).then((response) => {
    console.log("Dropbox API Response:", response);
    return response.json();
  });
};

////URL Rewrite Code
const urlDatabase = {};
app.use(bodyParser.json());

app.post("/shorten", (req, res) => {
  try {
    const { originalUrl } = req.body;

    const shortUrl = shortid.generate();

    urlDatabase[shortUrl] = originalUrl;

    return res.status(201).json({ shortUrl });
  } catch (error) {
    console.error("Error in /shorten endpoint:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/:shortUrl", (req, res) => {
  try {
    const { shortUrl } = req.params;

    const originalUrl = urlDatabase[shortUrl];

    if (originalUrl) {
      return res.redirect(301, originalUrl);
    } else {
      return res.status(404).json({ error: "Short URL not found" });
    }
  } catch (error) {
    console.error("Error in /:shortUrl endpoint:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.use("/:shortUrl/attobility", (req, res) => {
  try {
    const { shortUrl } = req.params;
    const originalUrl = urlDatabase[shortUrl];

    if (originalUrl) {
      request.get(originalUrl).pipe(res);
    } else {
      return res.status(404).json({ error: "Short URL not found" });
    }
  } catch (error) {
    console.error("Error in /:shortUrl/atto endpoint:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

////Sockets
var conns = [];
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
io.on("connection", (socket) => {
  conns.push(socket);
  console.log("We are live and connected=======", socket.id, new Date());
  socket.on("send-msg", (data) => {
    console.log("------send-msg----", { data });
    io.emit("msg-recieve", data);
  });
  socket.on("disconnect", () => {
    conns.splice(conns.indexOf(socket), 1);
  });
});

httpServer.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
