import app from './app.js'; 
import connectDB from './db/connection.js'; 
import dotenv from 'dotenv';
import logger from './utils/winston.js'; 
import { initSocket } from './utils/socket.js';
import http from 'http';
import './workers/riskWorker.js'; // Start the BullMQ worker
dotenv.config();

const PORT = process.env.PORT || 5000; 

// Create HTTP server wrapping the Express app
const server = http.createServer(app);

// Initialize Socket.io on the server
initSocket(server);

const startServer = async () => {
    try {
        await connectDB();
        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
        });
    } catch (error) {
        logger.error(`Failed to start server: ${error.message}`);
        process.exit(1);
    }
};

startServer();
