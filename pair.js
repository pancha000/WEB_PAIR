const { exec } = require("child_process");
const express = require("express");
const fs = require("fs");
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

const router = express.Router();

function removeFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { recursive: true, force: true });
        console.log(`Removed file: ${filePath}`);
    }
}

router.get("/", async (req, res) => {
    let num = req.query.number;
    if (!num) {
        return res.status(400).json({ error: "Phone number is required" });
    }

    async function PanchaPair() {
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);

        try {
            const PanchaPairWeb = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" }).child({ level: "fatal" })
                    ),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            if (!PanchaPairWeb.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, ""); 
                const code = await PanchaPairWeb.requestPairingCode(num);
                if (!res.headersSent) {
                    res.json({ code }); 
                }
            }

            PanchaPairWeb.ev.on("creds.update", saveCreds);
            PanchaPairWeb.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    try {
                        await delay(10000);
                        const authPath = "./session/";

                        const randomMegaId = (length = 6, numberLength = 4) => {
                            const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                            let result = "";
                            for (let i = 0; i < length; i++) {
                                result += characters.charAt(Math.floor(Math.random() * characters.length));
                            }
                            const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                            return `${result}${number}`;
                        };

                        const megaUrl = await upload(fs.createReadStream(authPath + "creds.json"), `${randomMegaId()}.json`);

                        const stringSession = megaUrl.replace("https://mega.nz/file/", "");

                        // Send session info to user
                        const sid = `*PANCHA [The powerful WA BOT]*\n\n👉 ${stringSession} 👈\n\n*This is your Session ID, copy this ID and paste it into config.js*\n\n*Need Help? Contact Below Link*\n\nhttps://wa.me/message/PI2536ELHQZ7L1\n\n*Join WhatsApp Group*\n\nhttps://chat.whatsapp.com/F639uXMjmAZIwTQQopArx2`;

                        await PanchaPairWeb.sendMessage(jidNormalizedUser(PanchaPairWeb.user.id), {
                            image: { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsjuYdk3u_6CaCXjx-KCMYpPofmlJd8DPY6Q&usqp=CAU" },
                            caption: sid,
                        });

                        await PanchaPairWeb.sendMessage(jidNormalizedUser(PanchaPairWeb.user.id), { text: stringSession });

                        const warning = `🛑 *Do not share this code with anyone* 🛑`;
                        await PanchaPairWeb.sendMessage(jidNormalizedUser(PanchaPairWeb.user.id), { text: warning });

                        if (!res.headersSent) {
                            res.json({ session_id: stringSession });
                        }

                    } catch (err) {
                        console.error("Error sending session:", err);
                        exec("pm2 restart prabath");
                    }

                    await delay(100);
                    removeFile("./session");
                    process.exit(0);
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log("Reconnecting after disconnect...");
                    await delay(10000);
                    PanchaPair();
                }
            });

        } catch (err) {
            console.error("Service error:", err);
            exec("pm2 restart Robin-md");
            removeFile("./session");

            if (!res.headersSent) {
                res.status(503).json({ error: "Service Unavailable" });
            }
        }
    }

    PanchaPair();
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    exec("pm2 restart Slpancha");
});

module.exports = router;
