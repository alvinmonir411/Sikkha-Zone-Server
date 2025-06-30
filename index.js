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

  try {
    // for search data
    app.get("/Articles/search", async (req, res) => {
      try {
        const search = req.query.q;
        if (!search) {
          return res.status(400).json({ message: "Search query is required" });
        }

        const result = await articlescollection
          .find({
            $or: [
              { title: { $regex: search, $options: "i" } },
              { author: { $regex: search, $options: "i" } },
              { category: { $regex: search, $options: "i" } },
              { tags: { $regex: search, $options: "i" } },
            ],
          })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Search error:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
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
    app.get("/Articles/id/:id", async (req, res) => {
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
      const result = await articlescollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
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
