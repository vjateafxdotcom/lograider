const WebSocket = require('ws');

class WebSocketManager {
  constructor(server, db) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.db = db;
    this.teamConnections = new Map(); // teamId -> Set<WebSocket>

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const teamId = url.pathname.split('/ws/')[1];

      if (!teamId) {
        ws.close(4000, 'Team ID required');
        return;
      }

      // Authenticate via query param token
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Authentication required');
        return;
      }

      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'dev-secret';
      try {
        const decoded = jwt.verify(token, secret);
        ws.user = decoded;
      } catch {
        ws.close(4002, 'Invalid token');
        return;
      }

      // Join team room
      if (!this.teamConnections.has(teamId)) {
        this.teamConnections.set(teamId, new Set());
      }
      this.teamConnections.get(teamId).add(ws);

      ws.teamId = teamId;
      console.log(`Client connected to team ${teamId}`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          // Handle client messages if needed
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected from team ${teamId}`);
        this.teamConnections.get(teamId)?.delete(ws);
        if (this.teamConnections.get(teamId)?.size === 0) {
          this.teamConnections.delete(teamId);
        }
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    });
  }

  // Broadcast to all clients in a team
  broadcastToTeam(teamId, data) {
    const clients = this.teamConnections.get(teamId);
    if (!clients) return;

    const message = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  // Notify a specific client
  sendToUser(userId, teamId, data) {
    const clients = this.teamConnections.get(teamId);
    if (!clients) return;

    const message = JSON.stringify(data);
    for (const client of clients) {
      if (client.user?.id === userId && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  close() {
    this.wss.clients.forEach((client) => client.close());
    this.wss.close();
  }
}

module.exports = WebSocketManager;
