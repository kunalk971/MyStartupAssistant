import { useState, useEffect, useRef, useCallback } from 'react'
import './index.css'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
  faPaperPlane, 
  faRobot, 
  faUser, 
  faTrash, 
  faCog,
  faBolt,
  faTemperatureHalf,
  faChevronUp,
  faChevronDown,
  faArrowUp,
  faArrowDown,
  faCircle
} from '@fortawesome/free-solid-svg-icons'

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo')
  const [temperature, setTemperature] = useState(0.7)
  const [useStreaming, setUseStreaming] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const scrollTrackerRef = useRef(null)

  // Load models on component mount
  useEffect(() => {
    fetchModels()
    scrollToBottom()
  }, [messages])

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models')
      const data = await response.json()
      setModels(data.models)
    } catch (error) {
      console.error('Failed to fetch models:', error)
    }
  }

  const scrollToBottom = useCallback(() => {
    if (isAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isAutoScroll])

  const scrollToTop = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return

    const container = messagesContainerRef.current
    const { scrollTop, scrollHeight, clientHeight } = container
    
    // Calculate scroll progress percentage
    const progress = (scrollTop / (scrollHeight - clientHeight)) * 100
    setScrollProgress(progress)

    // Show/hide scroll buttons based on position
    setShowScrollTop(scrollTop > 100)
    setShowScrollBottom(scrollTop < scrollHeight - clientHeight - 100)
  }, [])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      // Initial calculation
      handleScroll()
      
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll, messages.length])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      if (useStreaming) {
        await sendStreamingMessage(input)
      } else {
        await sendRegularMessage(input)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const sendRegularMessage = async (message) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        model: selectedModel,
        conversationId,
        temperature
      })
    })

    const data = await response.json()
    const aiMessage = { role: 'assistant', content: data.message }
    setMessages(prev => [...prev, aiMessage])
    setConversationId(data.conversationId)
    scrollToBottom()
  }

  const sendStreamingMessage = async (message) => {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        model: selectedModel,
        conversationId,
        temperature
      })
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let aiMessage = { role: 'assistant', content: '' }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim() !== '')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            
            if (data.token) {
              aiMessage.content += data.token
              setMessages(prev => {
                const newMessages = [...prev]
                const lastMessage = newMessages[newMessages.length - 1]
                if (lastMessage?.role === 'assistant') {
                  lastMessage.content = aiMessage.content
                } else {
                  newMessages.push({ ...aiMessage })
                }
                return newMessages
              })
            }

            if (data.conversationId) {
              setConversationId(data.conversationId)
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  }

  const clearConversation = () => {
    setMessages([])
    setConversationId(null)
    if (conversationId) {
      fetch(`/api/conversation/${conversationId}`, { method: 'DELETE' })
    }
  }

  const examplePrompts = [
  "Help me validate a startup idea in the fintech space",
  "Create a lean business model canvas for a SaaS startup",
  "Suggest a go-to-market strategy for an early-stage startup",
  "How can I find my first 100 customers?",
  "Draft a pitch deck outline for seed investors"
]

  // Get message count for scroll indicators
  const messageCount = messages.length

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">
            <FontAwesomeIcon icon={faRobot} className="logo-icon" />
            AI Chat
          </h1>
          <button 
            className="new-chat-btn"
            onClick={clearConversation}
          >
            <FontAwesomeIcon icon={faTrash} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="model-section">
          <div className="section-header">
            <h3>Model</h3>
          </div>
          <select 
            className="model-select"
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map(model => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.provider})
              </option>
            ))}
          </select>
        </div>

        <div className="settings-section">
          <button 
            className="settings-toggle"
            onClick={() => setShowSettings(!showSettings)}
          >
            <FontAwesomeIcon icon={faCog} />
            <span>Settings</span>
          </button>
          
          {showSettings && (
            <div className="settings-panel">
              <div className="setting-item">
                <label className="setting-label">
                  <FontAwesomeIcon icon={faTemperatureHalf} />
                  Temperature: {temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="slider"
                />
              </div>
              
              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={useStreaming}
                    onChange={(e) => setUseStreaming(e.target.checked)}
                    className="checkbox"
                  />
                  <FontAwesomeIcon icon={faBolt} />
                  <span>Stream Responses</span>
                </label>
              </div>

              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isAutoScroll}
                    onChange={(e) => setIsAutoScroll(e.target.checked)}
                    className="checkbox"
                  />
                  <FontAwesomeIcon icon={faArrowDown} />
                  <span>Auto Scroll</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Scroll Progress Bar in Sidebar */}
        {messageCount > 0 && (
          <div className="scroll-progress-sidebar">
            <div className="progress-info">
              <span className="progress-text">Conversation</span>
              <span className="message-count">{messageCount} messages</span>
            </div>
            <div className="progress-track">
              <div 
                className="progress-fill"
                style={{ width: `${scrollProgress}%` }}
              />
            </div>
            <div className="progress-stats">
              <div className="stat">
                <FontAwesomeIcon icon={faCircle} className="user-stat" />
                <span>{messages.filter(m => m.role === 'user').length} user</span>
              </div>
              <div className="stat">
                <FontAwesomeIcon icon={faCircle} className="ai-stat" />
                <span>{messages.filter(m => m.role === 'assistant').length} AI</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Vertical Scroll Tracker */}
        <div className="scroll-tracker" ref={scrollTrackerRef}>
          <div className="scroll-track">
            <div 
              className="scroll-thumb"
              style={{ top: `${scrollProgress}%` }}
            />
          </div>
          <div className="scroll-markers">
            {messages.map((_, index) => (
              <div 
                key={index}
                className={`scroll-marker ${index % 2 === 0 ? 'user-marker' : 'ai-marker'}`}
                style={{ 
                  top: `${(index / Math.max(1, messages.length - 1)) * 100}%` 
                }}
                onClick={() => {
                  const container = messagesContainerRef.current
                  if (container) {
                    const itemHeight = container.scrollHeight / messages.length
                    container.scrollTo({ 
                      top: itemHeight * index, 
                      behavior: 'smooth' 
                    })
                  }
                }}
              />
            ))}
          </div>
        </div>

        <div className="chat-container">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-header">
                <FontAwesomeIcon icon={faRobot} className="welcome-icon" />
                <h2>How can I help you today?</h2>
                <p>Start a conversation or try one of the examples below</p>
              </div>
              
              <div className="example-prompts">
                {examplePrompts.map((prompt, index) => (
                  <button
                    key={index}
                    className="example-btn"
                    onClick={() => setInput(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div 
              className="messages-container" 
              ref={messagesContainerRef}
            >
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`}
                  data-index={index}
                >
                  <div className="message-avatar">
                    {msg.role === 'user' ? (
                      <FontAwesomeIcon icon={faUser} />
                    ) : (
                      <FontAwesomeIcon icon={faRobot} />
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <div className="message-sender">
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </div>
                      <div className="message-index">
                        #{index + 1}
                      </div>
                    </div>
                    <div className="message-text">{msg.content}</div>
                  </div>
                </div>
              ))}
              
              {isLoading && !useStreaming && (
                <div className="message ai-message">
                  <div className="message-avatar">
                    <FontAwesomeIcon icon={faRobot} />
                  </div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} className="scroll-anchor" />
            </div>
          )}

          {/* Floating Scroll Buttons */}
          {messageCount > 3 && (
            <>
              {showScrollTop && (
                <button 
                  className="scroll-button scroll-top"
                  onClick={scrollToTop}
                  aria-label="Scroll to top"
                >
                  <FontAwesomeIcon icon={faChevronUp} />
                </button>
              )}
              
              {showScrollBottom && (
                <button 
                  className="scroll-button scroll-bottom"
                  onClick={scrollToBottom}
                  aria-label="Scroll to bottom"
                >
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>
              )}
            </>
          )}

          {/* Progress Bar */}
          {messageCount > 0 && (
            <div className="scroll-progress-bar">
              <div className="progress-container">
                <div 
                  className="progress-bar"
                  style={{ width: `${scrollProgress}%` }}
                />
                <div className="progress-labels">
                  <span>Top</span>
                  <span>{Math.round(scrollProgress)}%</span>
                  <span>Bottom</span>
                </div>
              </div>
            </div>
          )}

          {/* <form className="input-container" onSubmit={sendMessage}> */}
            <div className="input-wrapper" onSubmit={sendMessage}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message AI..."
                disabled={isLoading}
                className="message-input"
                rows="1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(e)
                  }
                }}
              />
              <button 
                type="submit" 
                disabled={isLoading || !input.trim()}
                className="send-button"
              >
                <FontAwesomeIcon icon={faPaperPlane} />
              </button>
            </div>
            <div className="input-footer">
              <small>
                Press <kbd>Enter</kbd> to send • <kbd>Shift + Enter</kbd> for new line
                {isAutoScroll && ' • Auto-scroll enabled'}
              </small>
            </div>
          {/* </form> */}
        </div>
      </main>
    </div>



    // ... inside App component


 
)
  
}

export default App
