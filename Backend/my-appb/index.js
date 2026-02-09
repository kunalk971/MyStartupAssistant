const express = require('express');
const cors = require('cors');        // Added missing cors import
const dotenv = require('dotenv');
const { OpenAI } = require('openai'); // Destructured import for SDK v4
const { v4: uuidv4 } = require('uuid'); // CommonJS import for uuid

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
const conversations = new Map();

// --- HELPER FUNCTION ---
// Manages conversation history state
const getOrCreateConversation = (id) => {
  let conversationId = id;
  let history = [];

  if (conversationId && conversations.has(conversationId)) {
    history = conversations.get(conversationId);
  } else {
    conversationId = uuidv4();
    // Optional: Add a system message for new chats
    history = [{ role: 'system', content: 'You are a helpful AI assistant.' }];
  }

  return { conversationId, history };
};

// --- ENDPOINTS ---

// 1. Get available models
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
      { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' }
    ]
  });
});

// 2. Standard Chat (Non-streaming)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model, conversationId, temperature } = req.body;
    
    // 1. Get History
    const { conversationId: chatId, history } = getOrCreateConversation(conversationId);

    // 2. Add User Message
    history.push({ role: 'user', content: message });

    // 3. Call OpenAI
    const response = await openai.chat.completions.create({
      model: model || 'gpt-3.5-turbo',
      messages: history,
      temperature: temperature || 0.7,
    });

    const aiMessage = response.choices[0].message.content;
    
    // 4. Update History
    history.push({ role: 'assistant', content: aiMessage });
    conversations.set(chatId, history);

    // 5. Respond
    res.json({ message: aiMessage, conversationId: chatId });

  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// 3. Streaming Chat
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { message, model, conversationId, temperature } = req.body;
    
    // 1. Get History
    const { conversationId: chatId, history } = getOrCreateConversation(conversationId);

    // 2. Add User Message
    history.push({ role: 'user', content: message });

    // 3. Set SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 4. Start Stream
    const stream = await openai.chat.completions.create({
      model: model || 'gpt-3.5-turbo',
      messages: history,
      temperature: temperature || 0.7,
      stream: true,
    });

    let fullAiResponse = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullAiResponse += content;
        // Send data in SSE format: "data: {...} \n\n"
        res.write(`data: ${JSON.stringify({ token: content, conversationId: chatId })}\n\n`);
      }
    }

    // 5. Update History (after stream finishes)
    history.push({ role: 'assistant', content: fullAiResponse });
    conversations.set(chatId, history);

    res.end();

  } catch (error) {
    console.error('Stream Error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    res.end();
  }
});

// 4. Delete Conversation
app.delete('/api/conversation/:id', (req, res) => {
  const { id } = req.params;
  if (conversations.has(id)) {
    conversations.delete(id);
  }
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});