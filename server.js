require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/chat', chatRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
