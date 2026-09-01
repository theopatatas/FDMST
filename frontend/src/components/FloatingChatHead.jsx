import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FaCheckDouble, FaCircle, FaComments, FaMinus, FaPaperclip, FaPaperPlane, FaSearch, FaTimes, FaUserMd } from 'react-icons/fa'
import { authStorage, fdmstApi } from '../api/fdmstApi.js'
import { useToast } from '../context/ToastContext.jsx'
import { getChatSocket } from '../utils/chatSocket.js'

function initials(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'FD'
}

function displayName(user) {
  return user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'FDMST User'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const sameDay = date.toDateString() === new Date().toDateString()
  return date.toLocaleString('en-PH', sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' })
}

function isAuthError(error) {
  return error?.status === 401 || error?.status === 403
}

function Avatar({ user, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-10 w-10 text-xs' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-12 w-12 text-sm'

  if (user?.profilePhoto) {
    return <img src={user.profilePhoto} alt="" className={`${sizeClass} rounded-full object-cover ring-2 ring-white shadow-sm`} />
  }

  return (
    <span className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-sky-950 font-bold text-amber-400 ring-2 ring-white shadow-sm`}>
      {initials(user)}
    </span>
  )
}

function ConversationButton({ conversation, active, onClick }) {
  const otherUser = conversation.otherUser

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-sky-50 ${active ? 'bg-sky-50 ring-1 ring-sky-100' : ''}`}
    >
      <div className="relative">
        <Avatar user={otherUser} size="sm" />
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${otherUser?.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-sky-950">{displayName(otherUser)}</p>
          <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatTime(conversation.lastMessageAt)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className="truncate text-xs text-slate-500">{conversation.lastMessage || 'No messages yet.'}</p>
          {conversation.unreadCount > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
              {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

function MessageBubble({ message, previousMessage, currentUserId }) {
  const mine = String(message.sender) === String(currentUserId)
  const grouped = previousMessage && String(previousMessage.sender) === String(message.sender)

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-4'}`}>
      <div className={`max-w-[82%] rounded-2xl px-4 py-2 shadow-sm ${mine ? 'rounded-br-md bg-sky-950 text-white' : 'rounded-bl-md bg-white text-slate-700 ring-1 ring-slate-100'}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? 'text-sky-100' : 'text-slate-400'}`}>
          <span>{formatTime(message.createdAt)}</span>
          {mine ? <FaCheckDouble className={message.deliveryStatus === 'read' ? 'text-emerald-300' : 'text-sky-200'} /> : null}
        </div>
      </div>
    </div>
  )
}

function MessageToast({ toastData, onOpen, onClose }) {
  if (!toastData) return null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-24 right-5 z-50 flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-2xl shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-slate-900/20"
    >
      <Avatar user={toastData.sender} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-sky-950">{displayName(toastData.sender)}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{toastData.preview}</p>
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onClose()
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss message preview"
      >
        <FaTimes />
      </span>
    </button>
  )
}

function FloatingChatHead({ requestedConversationId = '', isOpen, onOpen, onClose, onUnreadChange }) {
  const toast = useToast()
  const currentUser = authStorage.getUser()
  const isPatient = currentUser?.role === 'patient'
  const [conversations, setConversations] = useState([])
  const [recipients, setRecipients] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('active')
  const [composer, setComposer] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [messageToast, setMessageToast] = useState(null)
  const messagesEndRef = useRef(null)
  const selectedConversationIdRef = useRef('')
  const isOpenRef = useRef(isOpen)

  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + (Number(conversation.unreadCount) || 0), 0),
    [conversations],
  )

  const loadConversations = useCallback(async ({ preserveSelection = true } = {}) => {
    if (!authStorage.isAuthenticated()) {
      setConversations([])
      setIsLoading(false)
      return
    }

    try {
      const response = await fdmstApi.getConversations({ search, status: filter })
      const nextConversations = response.data || []
      setConversations(nextConversations)

      const requestedConversation = requestedConversationId
        ? nextConversations.find((item) => item.id === requestedConversationId)
        : null

      if (requestedConversation) {
        setSelectedConversation(requestedConversation)
      } else if (!preserveSelection || !selectedConversationIdRef.current) {
        setSelectedConversation((current) => current || nextConversations[0] || null)
      } else {
        setSelectedConversation((current) => nextConversations.find((item) => item.id === current?.id) || current || nextConversations[0] || null)
      }
    } catch (error) {
      if (isAuthError(error)) {
        setConversations([])
        return
      }
      toast.error(error.message || 'Unable to load conversations.')
      setConversations([])
    } finally {
      setIsLoading(false)
    }
  }, [filter, requestedConversationId, search, toast])

  const loadRecipients = useCallback(async () => {
    if (!authStorage.isAuthenticated()) {
      setRecipients([])
      return
    }

    try {
      const response = await fdmstApi.getMessageRecipients()
      setRecipients(response.data || [])
    } catch {
      setRecipients([])
    }
  }, [])

  const ensurePatientConversation = useCallback(async () => {
    if (!isPatient || !authStorage.isAuthenticated()) return
    try {
      const response = await fdmstApi.startConversation({})
      setSelectedConversation((current) => current || response.conversation || null)
      await loadConversations({ preserveSelection: true })
    } catch (error) {
      if (isAuthError(error)) return
      toast.error(error.message || 'Unable to start a clinic conversation.')
    }
  }, [isPatient, loadConversations, toast])

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id || ''
  }, [selectedConversation?.id])

  useEffect(() => {
    onUnreadChange?.(unreadTotal)
  }, [onUnreadChange, unreadTotal])

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(async () => {
        await loadRecipients()
        await loadConversations({ preserveSelection: true })
        if (!cancelled) await ensurePatientConversation()
      })
    return () => {
      cancelled = true
    }
  }, [ensurePatientConversation, loadConversations, loadRecipients])

  useEffect(() => {
    if (requestedConversationId) onOpen?.()
  }, [onOpen, requestedConversationId])

  useEffect(() => {
    const conversationId = selectedConversation?.id
    if (!conversationId) return undefined

    let cancelled = false
    Promise.resolve()
      .then(async () => {
        if (!authStorage.isAuthenticated()) return
        const response = await fdmstApi.getConversationMessages(conversationId)
        if (cancelled) return
        setMessages(response.data || [])
        setSelectedConversation((current) => response.conversation || current)
        if (isOpen) {
          await fdmstApi.markConversationRead(conversationId)
        }
        if (!cancelled && isOpen) {
          setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation))
        }
      })
      .catch((error) => {
        if (isAuthError(error)) return
        if (!cancelled) toast.error(error.message || 'Unable to load messages.')
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, selectedConversation?.id, toast])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isOpen])

  useEffect(() => {
    const socket = getChatSocket()
    if (!socket) return undefined

    const handleNewMessage = ({ conversationId, message, sender }) => {
      const normalizedConversationId = String(conversationId)
      const isSelected = selectedConversationIdRef.current === normalizedConversationId
      const isOwnMessage = String(message.sender) === String(currentUser?.id)
      let knownConversation = null

      setConversations((current) => current.map((conversation) => (
        conversation.id === normalizedConversationId
          ? (knownConversation = conversation, {
              ...conversation,
              lastMessage: message.content,
              lastMessageAt: message.createdAt,
              unreadCount: isSelected && isOpenRef.current
                ? 0
                : isOwnMessage || conversation.lastMessageAt === message.createdAt
                  ? conversation.unreadCount || 0
                  : (conversation.unreadCount || 0) + 1,
            })
          : conversation
      )).sort((left, right) => new Date(right.lastMessageAt || 0) - new Date(left.lastMessageAt || 0)))

      if (!knownConversation) {
        loadConversations({ preserveSelection: true }).catch(() => {})
      }

      if (isSelected) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
        if (isOpenRef.current) fdmstApi.markConversationRead(normalizedConversationId).catch(() => {})
      }

      if (!isOwnMessage && (!isOpenRef.current || !isSelected)) {
        setMessageToast({
          conversationId: normalizedConversationId,
          sender: sender || knownConversation?.otherUser,
          preview: message.content,
        })
        window.clearTimeout(window.__fdmstMessageToastTimer)
        window.__fdmstMessageToastTimer = window.setTimeout(() => setMessageToast(null), 5000)
      }
    }

    const handlePresence = ({ userId, isOnline }) => {
      setConversations((current) => current.map((conversation) => (
        conversation.otherUser?.id === userId
          ? { ...conversation, otherUser: { ...conversation.otherUser, isOnline } }
          : conversation
      )))
    }

    socket.on('message:new', handleNewMessage)
    socket.on('message:notification', handleNewMessage)
    socket.on('presence:update', handlePresence)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:notification', handleNewMessage)
      socket.off('presence:update', handlePresence)
    }
  }, [currentUser?.id, loadConversations])

  useEffect(() => {
    const socket = getChatSocket()
    if (!socket || !selectedConversation?.id || !isOpen) return undefined
    socket.emit('conversation:join', selectedConversation.id)
    return () => socket.emit('conversation:leave', selectedConversation.id)
  }, [isOpen, selectedConversation?.id])

  const filteredRecipients = useMemo(() => {
    const existingIds = new Set(conversations.map((conversation) => String(conversation.otherUser?.id)))
    return recipients.filter((recipient) => !existingIds.has(String(recipient.id)))
  }, [conversations, recipients])

  const startConversation = async (recipient) => {
    if (!authStorage.isAuthenticated()) return

    try {
      const payload = isPatient ? { clinicUserId: recipient?.id } : { patientId: recipient.id }
      const response = await fdmstApi.startConversation(payload)
      setSelectedConversation(response.conversation)
      await loadConversations({ preserveSelection: true })
      onOpen?.()
    } catch (error) {
      if (isAuthError(error)) return
      toast.error(error.message || 'Unable to open conversation.')
    }
  }

  const sendMessage = async () => {
    const content = composer.trim()
    if (!content || !selectedConversation?.id || isSending) return
    if (!authStorage.isAuthenticated()) return

    setComposer('')
    setIsSending(true)
    try {
      const response = await fdmstApi.sendConversationMessage(selectedConversation.id, { content })
      setMessages((current) => current.some((item) => item.id === response.message.id) ? current : [...current, response.message])
      await loadConversations({ preserveSelection: true })
    } catch (error) {
      setComposer(content)
      if (isAuthError(error)) return
      toast.error(error.message || 'Unable to send message.')
    } finally {
      setIsSending(false)
    }
  }

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const openToastConversation = () => {
    const conversation = conversations.find((item) => item.id === messageToast?.conversationId)
    if (conversation) setSelectedConversation(conversation)
    setMessageToast(null)
    onOpen?.()
  }

  const otherUser = selectedConversation?.otherUser

  return (
    <>
      <MessageToast toastData={messageToast} onOpen={openToastConversation} onClose={() => setMessageToast(null)} />

      {isOpen ? (
        <section className="fixed bottom-5 right-5 z-50 flex h-[min(42rem,calc(100vh-2rem))] w-[min(58rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 transition sm:bottom-6 sm:right-6 lg:grid lg:grid-cols-[20rem_1fr]">
          <aside className="hidden min-h-0 flex-col border-r border-slate-200 bg-white lg:flex">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-sky-950">Messages</p>
                  <p className="text-xs font-medium text-slate-500">Secure clinic chat</p>
                </div>
                <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Minimize chat">
                  <FaMinus />
                </button>
              </div>
              <div className="relative mt-4">
                <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={isPatient ? 'Search clinic messages...' : 'Search patients...'}
                />
              </div>
              {!isPatient ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {['active', 'unread', 'archived'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={`h-9 rounded-xl text-xs font-bold transition ${filter === item ? 'bg-sky-950 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
              {isLoading ? <p className="p-4 text-sm text-slate-500">Loading conversations...</p> : null}
              {!isLoading && conversations.map((conversation) => (
                <ConversationButton key={conversation.id} conversation={conversation} active={selectedConversation?.id === conversation.id} onClick={() => setSelectedConversation(conversation)} />
              ))}
              {!isLoading && !conversations.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">No conversations yet.</div>
              ) : null}
              {!isPatient && filteredRecipients.length ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-slate-400">Start Conversation</p>
                  {filteredRecipients.slice(0, 6).map((recipient) => (
                    <button key={recipient.id} type="button" onClick={() => startConversation(recipient)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-slate-50">
                      <Avatar user={recipient} size="sm" />
                      <span className="truncate text-sm font-semibold text-sky-950">{displayName(recipient)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-slate-50">
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {selectedConversation ? <Avatar user={otherUser} size="sm" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-950 text-amber-400"><FaComments /></span>}
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-sky-950">{selectedConversation ? displayName(otherUser) : 'Messages'}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                    {selectedConversation ? (
                      <>
                        <FaCircle className={`h-2 w-2 ${otherUser?.isOnline ? 'text-emerald-500' : 'text-slate-300'}`} />
                        {otherUser?.isOnline ? 'Online' : 'Offline'}
                      </>
                    ) : 'Choose a conversation'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-950 sm:inline-flex">
                  <FaUserMd /> Secure chat
                </span>
                <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Minimize chat">
                  <FaMinus />
                </button>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:hidden">
              <div className="border-b border-slate-200 bg-white p-3">
                <div className="relative">
                  <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={isPatient ? 'Search clinic messages...' : 'Search patients...'}
                  />
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {conversations.map((conversation) => (
                    <button key={conversation.id} type="button" onClick={() => setSelectedConversation(conversation)} className={`shrink-0 rounded-full ${selectedConversation?.id === conversation.id ? 'ring-2 ring-sky-300' : ''}`}>
                      <Avatar user={conversation.otherUser} size="sm" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {selectedConversation ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                  {messages.length ? messages.map((message, index) => (
                    <MessageBubble key={message.id} message={message} previousMessage={messages[index - 1]} currentUserId={currentUser?.id} />
                  )) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center shadow-sm">
                        <p className="font-semibold text-sky-950">No messages yet</p>
                        <p className="mt-2 text-sm text-slate-500">Send a message to begin the conversation.</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <footer className="border-t border-slate-200 bg-white p-3">
                  <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100">
                    <button type="button" className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-sky-950" aria-label="Attach file">
                      <FaPaperclip />
                    </button>
                    <textarea
                      className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm font-medium text-slate-700 outline-none"
                      value={composer}
                      onChange={(event) => setComposer(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder="Write a message..."
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={!composer.trim() || isSending}
                      className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-950 text-white shadow-sm transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Send message"
                    >
                      <FaPaperPlane />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Press Enter to send. Shift + Enter starts a new line.</p>
                </footer>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div>
                  <FaComments className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-4 font-semibold text-sky-950">Select a conversation</p>
                  <p className="mt-2 text-sm text-slate-500">Your patient and clinic messages will appear here.</p>
                </div>
              </div>
            )}
          </section>
        </section>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="fixed bottom-5 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-sky-950 text-2xl text-amber-400 shadow-2xl shadow-sky-950/30 transition hover:-translate-y-1 hover:bg-sky-900 focus:outline-none focus:ring-4 focus:ring-sky-200 sm:bottom-6 sm:right-6"
          aria-label="Open messages"
        >
          <FaComments />
          {unreadTotal ? (
            <span className="absolute -right-1 -top-1 flex min-h-6 min-w-6 animate-pulse items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          ) : null}
        </button>
      )}
    </>
  )
}

export default FloatingChatHead
