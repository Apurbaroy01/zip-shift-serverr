const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const admin = require("firebase-admin");
dotenv.config()
const stripe = require('stripe')(process.env.PAYMENT_KEY);
const app = express()
const port = process.env.PORT || 5000

// zip_shift12

app.use(cors())
app.use(express.json())

console.log(process.env.USER_PASs)


const serviceAccount = require("./firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.USER_PASs}@cluster0.4gy1j38.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        await client.connect();

        console.log("You successfully connected to MongoDB!✅");


        const userCollection = client.db("zip_shift").collection("user");
        const parcelCollection = client.db("zip_shift").collection("parcels");
        const paymentCollection = client.db("zip_shift").collection("payment");
        const ridersCollection = client.db("zip_shift").collection("riders");


        // custom middleware verify firebase token

        const verifyFBToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;
            // console.log("header in a middleware:", authHeader)
            if (!authHeader) {
                return res.status(401).send({ messagr: "unathorized access" })
            }
            const token = authHeader.split(' ')[1]
            if (!token) {
                return res.status(401).send({ messagr: "unathorized accesss" })
            }
            console.log("token:", token)

            // verify token-----------
            try {
                const decoded = await admin.auth().verifyIdToken(token)
                req.decoded = decoded;
                next();
            }
            catch (error) {
                return res.status(401).send({ messagr: "unathorized access" })
            }


        }

        // user---------------------
        app.post('/user', async (req, res) => {
            const email = req.body.email
            const userExits = await userCollection.findOne({ email })
            if (userExits) {
                return res.status(2000).send({ message: "user already exit", insertId: false })
            }
            const user = req.body;
            const result = await userCollection.insertOne(user)
            res.send(result);
        })

        app.get('/users/search', async (req, res) => {
            const emailQuery = req.query.email;

            if (!emailQuery) {
                return res.status(400).send({ message: "missing emmail query" })
            }

            const regex = RegExp(emailQuery, "i");
            const query = { email: regex }

            const result = await userCollection.find(query).toArray()
            res.send(result)
        })
        // user admin ar janno---------
        app.patch('/users/:id/role', async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;

            if (!["admin", "user"].includes(role)) {
                return res.status(400).send({ message: "invalid role" })
            }

            const query = { _id: new ObjectId(id) }
            const updatedoc = {
                $set: {
                    role,
                }
            }
            const result=await userCollection.updateOne(query,updatedoc)
            res.send(result)

        })




        // parcel-------------------------------
        app.post('/parcels', async (req, res) => {
            const body = req.body
            const result = await parcelCollection.insertOne(body)
            res.send(result); no
        })

        app.get('/parcels', async (req, res) => {
            const userEmail = req.query.email;
            const query = userEmail ? { email: userEmail } : {};
            const options = {
                sort: { creation_Date: - 1 }
            }
            const result = await parcelCollection.find(query, options).toArray()
            res.send(result);
        });

        app.get('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await parcelCollection.findOne(query)
            res.send(result);

        })

        app.delete('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const query = { _id: new ObjectId(id) }
            const result = await parcelCollection.deleteOne(query)
            res.send(result);
        })

        // tracking----------------------


        app.post("/tracking", async (req, res) => {
            const { tracking_id, parcel_id, status, message, updated_by = '' } = req.body;

            const log = {
                tracking_id,
                parcel_id: parcel_id ? new ObjectId(parcel_id) : undefined,
                status,
                message,
                time: new Date(),
                updated_by,
            };

            const result = await trackingCollection.insertOne(log);
            res.send({ success: true, insertedId: result.insertedId });
        });
        // payment section--------------------

        app.post('/cteate_payment_intant', async (req, res) => {
            const amountIncents = req.body.amountInCents;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountIncents, // amount in cents, so 1000 = $10
                    currency: "usd",
                    payment_method_types: ['card'],
                });
                res.json({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                console.error("Payment Intent Error:", error);
                res.status(500).send({ error: error.message });
            }
        });


        app.post('/payment', async (req, res) => {
            const { parcelId, email, amount, transactionId, paymentMathod } = req.body;
            const query = { _id: new ObjectId(parcelId) }
            const updatedoc = {

                $set: {
                    payment_status: "paid",

                }

            }
            const updateResult = await parcelCollection.updateOne(query, updatedoc)

            const paymentDocument = {
                parcelId,
                email,
                amount,
                paid_At: new Date().toISOString(),
                transactionId,
                paymentMathod
            }
            const result = await paymentCollection.insertOne(paymentDocument)

            res.send(updateResult, result);

        });


        app.get('/payment', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            console.log("decoded", req.decoded)
            if (req.decoded.email !== email) {
                return res.status(403).send({ messagr: "forbidden access" })
            }
            const query = { email: email };
            const result = await paymentCollection.find(query).toArray()
            res.send(result);
        })


        // ------------------------------------
        // riders---------
        app.post('/riders', async (req, res) => {
            const rider = req.body;
            const result = await ridersCollection.insertOne(rider)
            res.send(result)
        });

        app.get('/riders/pending', async (req, res) => {
            const result = await ridersCollection.find({ status: "pending" }).toArray();
            res.send(result);
        })
        app.get('/riders/active', async (req, res) => {
            const result = await ridersCollection.find({ status: "active" }).toArray();
            res.send(result);
        })
        app.patch('/riders/:id/status', async (req, res) => {
            const id = req.params.id;
            const { status, email } = req.body;
            const query = { _id: new ObjectId(id) }
            const updatedoc = {
                $set: {
                    status
                }
            }
            const result = await ridersCollection.updateOne(query, updatedoc)

            if (status === "active") {
                const userQuery = { email }
                const userUpdatedoc = {
                    $set: {
                        role: "rider"
                    },

                }
                await userCollection.updateOne(userQuery, userUpdatedoc)
            }
            res.send(result);
        })

    }
    catch (error) {
        console.error("Error❌", error.message)
    }
}
run();


app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
