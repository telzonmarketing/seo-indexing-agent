'use strict';

const fs = require('fs');
const path = require('path');

const CLIENTS_FILE = path.resolve(process.cwd(), 'config/clients.json');

function loadClients() {
  if (!fs.existsSync(CLIENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveClients(clients) {
  const dir = path.dirname(CLIENTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

function getClient(id) {
  const clients = loadClients();
  const client = clients.find(c => c.id === id);
  if (!client) throw new Error(`Client "${id}" not found. Run: node src/index.js clients`);
  return client;
}

function addClient(client) {
  const clients = loadClients();
  if (clients.find(c => c.id === client.id)) {
    throw new Error(`Client with id "${client.id}" already exists.`);
  }
  clients.push({ ...client, enrolled: new Date().toISOString().slice(0, 10) });
  saveClients(clients);
  return client;
}

function removeClient(id) {
  const clients = loadClients();
  const filtered = clients.filter(c => c.id !== id);
  if (filtered.length === clients.length) throw new Error(`Client "${id}" not found.`);
  saveClients(filtered);
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { loadClients, getClient, addClient, removeClient, slugify };
