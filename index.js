require("dotenv").config();
const express = require("express");
const { ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World! this is sikka zone ");
});

// MongoDB setup
const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const decoded = Buffer.from(process.env.Fb_Service_key, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);
const { credential } = require("firebase-admin");
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// verify firebase token
const verifyfirebasetoken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized access: No token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(403).json({ message: "Forbidden: Invalid token" });
  }
};

async function run() {
  // await client.connect();
  const articlescollection = client
    .db("alvinmonir411")
    .collection("AllArticles");
  const bookmarksCollection = client
    .db("alvinmonir411")
    .collection("Bookmarks");

  try {
    // for search data
    app.get("/Articles/search", async (req, res) => {
      const { q, sort } = req.query;
      console.log("Search:", q, "Sort:", sort);

      const search = q || "";

      const sortoption = {};
      if (sort === "newest") sortoption.date = -1;
      else if (sort === "oldest") sortoption.date = 1;
      else if (sort === "liked") sortoption.likeCount = -1;
      else sortoption.date = -1; // default to newest

      console.log("Sort option:", sortoption);

      try {
        const result = await articlescollection
          .find({
            $or: [
              { title: { $regex: search, $options: "i" } },
              { author: { $regex: search, $options: "i" } },
              { category: { $regex: search, $options: "i" } },
              { tags: { $regex: search, $options: "i" } },
            ],
          })
          .sort(sortoption)
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Search error:", error);
        res.status(500).send("Search failed");
      }
    });

    // Public routes
    app.get("/FeatureArticles", async (req, res) => {
      const result = await articlescollection.find().limit(8).toArray();
      res.send(result);
    });
    app.get("/Articles", async (req, res) => {
      try {
        const result = await articlescollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/Articles/:category", async (req, res) => {
      const { category } = req.params;
      const query = { category };
      const result = await articlescollection.find(query).toArray();
      res.send(result);
    });

    // Protected routes
    app.get("/Articles/id/:id", verifyfirebasetoken, async (req, res) => {
      const { id } = req.params;
      const result = await articlescollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.post(
      "/Articles/id/:id/comment",

      async (req, res) => {
        const { comment, articleId, author_name, author_photoURL } = req.body;
        const { id } = req.params;
        const newComment = { comment, articleId, author_name, author_photoURL };
        const result = await articlescollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { comment: newComment } }
        );
        res.send(result);
      }
    );

    app.post("/Articles/id/:id/like", async (req, res) => {
      const { id } = req.params;
      const userEmail = req.body.userEmail;

      const article = await articlescollection.findOne({
        _id: new ObjectId(id),
      });

      if (article.likedBy?.includes(userEmail)) {
        return res
          .status(400)
          .json({ message: "You already liked this article" });
      }

      const result = await articlescollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $inc: { likeCount: 1 },
          $push: { likedBy: userEmail },
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(400).json({ message: "Like failed, try again." });
      }
      res.json({ message: "Article liked successfully" });
    });

    app.get(
      "/MyArticle/author/:author_email",
      verifyfirebasetoken,
      async (req, res) => {
        if (req.params.author_email !== req.user.email) {
          return res.status(403).send({ message: "Forbidden: Email mismatch" });
        }
        const result = await articlescollection
          .find({ author_email: req.params.author_email })
          .toArray();
        res.send(result);
      }
    );

    app.post("/Articles", verifyfirebasetoken, async (req, res) => {
      const newArticle = req.body;
      const result = await articlescollection.insertOne(newArticle);
      res.send(result);
    });

    app.put("/Articles/:id", verifyfirebasetoken, async (req, res) => {
      const { id } = req.params;
      const updatedArticle = req.body;
      const result = await articlescollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedArticle }
      );
      res.send(result);
    });

    app.delete("/Articles/id/:id", verifyfirebasetoken, async (req, res) => {
      const { id } = req.params;

      await articlescollection.updateOne({ _id: new ObjectId(id) });

      const result = await articlescollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    // for admin dashboard
    app.get("/allarticle", async (req, res) => {
      const result = await articlescollection.find().toArray();
      res.send(result);
    });
    // Add bookmark
    app.post("/bookmarks", async (req, res) => {
      try {
        const { articleId, userEmail } = req.body;
        if (!articleId || !userEmail) {
          return res
            .status(400)
            .json({ error: "articleId and userEmail required" });
        }

        const exists = await bookmarksCollection.findOne({
          articleId,
          userEmail,
        });
        if (exists) {
          return res.status(409).json({ message: "Bookmark already exists" });
        }

        const result = await bookmarksCollection.insertOne({
          articleId,
          userEmail,
          createdAt: new Date(),
        });
        res.status(201).json({ insertedId: result.insertedId, success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Remove bookmark
    app.delete("/bookmarks", async (req, res) => {
      try {
        const { articleId, userEmail } = req.body;
        if (!articleId || !userEmail) {
          return res
            .status(400)
            .json({ error: "articleId and userEmail required" });
        }

        const result = await bookmarksCollection.deleteOne({
          articleId,
          userEmail,
        });
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Bookmark not found" });
        }

        res.json({ success: true, message: "Bookmark removed" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get all bookmarks for a user
    app.get("/bookmarks/:email", async (req, res) => {
      try {
        const userEmail = req.params.email;
        if (!userEmail)
          return res.status(400).json({ error: "Email required" });

        // 1. Find bookmarks for the user
        const bookmarks = await bookmarksCollection
          .find({ userEmail })
          .toArray();

        // 2. Extract article IDs from bookmarks
        const articleIds = bookmarks.map((bm) => new ObjectId(bm.articleId));

        // 3. Fetch articles by these IDs
        const articles = await articlescollection
          .find({
            _id: { $in: articleIds },
          })
          .toArray();

        // 4. Return articles
        res.json(articles);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // for visit count
    app.patch("/articles/:id/visit", async (req, res) => {
      try {
        const articleId = req.params.id;
        console.log(articleId);
        const result = await articlescollection.findOneAndUpdate(
          { _id: new ObjectId(articleId) },
          { $inc: { visitCount: 1 } },
          { returnDocument: "after" }
        );

        if (!result.value) {
          return res.status(404).json({ message: "Article not found" });
        }
        res.json({ visitCount: result.value.visitCount });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Connection remains open
  }
}

run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
