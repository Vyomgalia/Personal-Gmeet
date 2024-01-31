const path = require('path');
const express = require('express');
const http = require('http');
const moment = require('moment');
const socketio = require('socket.io');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const port = 5000;

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
    user: 'postgres',
    password: 'vyom',
    host: 'localhost',
    port: 5432,
    database: 'RegistrationForm',
};

let rooms = {};
let socketroom = {};
let socketname = {};
let micSocket = {};
let videoSocket = {};
let roomBoard = {};

io.on('connect', socket => {

    socket.on("join room", (roomid, username) => {

        socket.join(roomid);
        socketroom[socket.id] = roomid;
        socketname[socket.id] = username;
        micSocket[socket.id] = 'on';
        videoSocket[socket.id] = 'on';

        if (rooms[roomid] && rooms[roomid].length > 0) {
            rooms[roomid].push(socket.id);
            socket.to(roomid).emit('message', `${username} joined the room.`, 'Bot', moment().format(
                "h:mm a"
            ));
            io.to(socket.id).emit('join room', rooms[roomid].filter(pid => pid != socket.id), socketname, micSocket, videoSocket);
        }
        else {
            rooms[roomid] = [socket.id];
            io.to(socket.id).emit('join room', null, null, null, null);
        }

        io.to(roomid).emit('user count', rooms[roomid].length);

    });

    socket.on('action', msg => {
        if (msg == 'mute')
            micSocket[socket.id] = 'off';
        else if (msg == 'unmute')
            micSocket[socket.id] = 'on';
        else if (msg == 'videoon')
            videoSocket[socket.id] = 'on';
        else if (msg == 'videooff')
            videoSocket[socket.id] = 'off';

        socket.to(socketroom[socket.id]).emit('action', msg, socket.id);
    })

    socket.on('video-offer', (offer, sid) => {
        socket.to(sid).emit('video-offer', offer, socket.id, socketname[socket.id], micSocket[socket.id], videoSocket[socket.id]);
    })

    socket.on('video-answer', (answer, sid) => {
        socket.to(sid).emit('video-answer', answer, socket.id);
    })

    socket.on('new icecandidate', (candidate, sid) => {
        socket.to(sid).emit('new icecandidate', candidate, socket.id);
    })

    socket.on('message', (msg, username, roomid) => {
        io.to(roomid).emit('message', msg, username, moment().format(
            "h:mm a"
        ));
    })


    socket.on('disconnect', () => {
        if (!socketroom[socket.id]) return;
        socket.to(socketroom[socket.id]).emit('message', `${socketname[socket.id]} left the chat.`, `Bot`, moment().format(
            "h:mm a"
        ));
        socket.to(socketroom[socket.id]).emit('remove peer', socket.id);
        var index = rooms[socketroom[socket.id]].indexOf(socket.id);
        rooms[socketroom[socket.id]].splice(index, 1);
        io.to(socketroom[socket.id]).emit('user count', rooms[socketroom[socket.id]].length);
        delete socketroom[socket.id];
        console.log('--------------------');
        console.log(rooms[socketroom[socket.id]]);

        //toDo: push socket.id out of rooms
    });
})


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/getTeams', (req, res) => {
    const pool = new Pool(dbConfig);

    // Fetch teams from the database
    pool.query('SELECT DISTINCT team FROM register')
        .then(result => {
            const teams = result.rows.map(row => row.team);
            res.json({ success: true, teams });
        })
        .catch(error => {
            console.error('Error fetching teams from the database:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch teams.' });
        })
        .finally(() => {
            pool.end();
        });
});

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for SSL, false for TLS
    auth: {
      user: 'vyom.galia16168@sakec.ac.in',
      pass: '',
    },
  });

app.post('/generateMeetingLink', async (req, res) => {
    const { team } = req.body;

    try {
        // Query the PostgreSQL database to get the user's email based on name and team
        const result = await pool.query('SELECT email FROM register WHERE team = $1', [team]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }

        const { email } = result.rows[0];

        // Replace this with your actual logic for generating meeting links
        const randomMeetingId = Math.random().toString(36).substring(7);
        const meetingLink = `https://your-meeting-app.com/meeting/${randomMeetingId}`;

        const mailOptions = {
            from: 'vyom.galia16168@sakec.ac.in',
            to: email,
            subject: 'Meeting Link for Team ' + team,
            text: `Hello,\n\nHere is the meeting link for Team ${team}:\n${meetingLink}\n\nBest regards,\nYour Meeting App Team`,
        };

        // Send email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                res.status(500).json({ success: false, error: 'Failed to send email.' });
            } else {
                console.log('Email sent:', info.response);
                res.json({ success: true, meetingLink });
            }
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ success: false, error: 'Database error.' });
    }
});


const corsOptions = {
    origin: '*', // Temporarily for development, replace with specific origins later
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Database connection and server start
const pool = new Pool(dbConfig);

pool.connect()
    .then(() => {
        console.log('Connected to the database');
        // Start the server once the database connection is established
        server.listen(port, () => {
            console.log(`Server is running at http://localhost:${port}`);
        });
    })
    .catch(error => {
        console.error('Error connecting to the database:', error);
    });

// Express route handler for form submission
app.post('/submit', (req, res) => {
    console.log('Received a POST request to /submit');
    const { name, email, team, dob } = req.body;
    console.log('Received Form Data:', { name, email, team, dob });

    // Perform database insertion (modify this based on your database structure)
    pool.query('INSERT INTO register (name, email, team, dob) VALUES($1, $2, $3, $4)', [name, email, team, dob])
        .then(() => {
            console.log('Data successfully inserted into the database.');
            res.json({ success: true });
        })
        .catch(error => {
            console.error('Error inserting data into the database:', error);
            res.status(500).json({ success: false, error: error.message });
        });
});
 