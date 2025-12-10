import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './App.css'

// --- SVGs ---
const PlayIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M8 5v14l11-7z" /></svg>
const PauseIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
const DownloadIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="20" height="20" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>

const VolumeIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>

const API_BASE = 'http://127.0.0.1:5000/api'

function App() {
  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'library'
  const [library, setLibrary] = useState([])
  const [selectedTrack, setSelectedTrack] = useState(null)

  const refreshLibrary = async () => {
    try {
      const res = await axios.get(`${API_BASE}/history`)
      setLibrary(res.data)
      // Sync selectedTrack with new data
      setSelectedTrack(prev => {
        if (!prev) return null
        return res.data.find(t => t.id === prev.id) || prev
      })
      return res.data
    } catch (err) {
      console.error("Failed to load library", err)
      return []
    }
  }

  useEffect(() => {
    refreshLibrary()
  }, []) // Initial load

  useEffect(() => {
    if (activeTab === 'library') {
      refreshLibrary()
    }
  }, [activeTab])

  // Handle successful upload: switch to library and open the new track
  const handleUploadSuccess = async (newTrackData) => {
    const updatedLib = await refreshLibrary()
    const track = updatedLib.find(t => t.id === newTrackData.id)
    if (track) {
      setSelectedTrack(track)
    }
    setActiveTab('library')
  }

  return (
    <div className="container">
      <header>
        <h1>Music Track Separator</h1>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Music Track Separator
          </button>
          <button
            className={`tab ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            Music Library
          </button>
        </div>
      </header>

      <main>
        {activeTab === 'upload' ? (
          <UploadView onSuccess={handleUploadSuccess} />
        ) : (
          <LibraryView
            items={library}
            refresh={refreshLibrary}
            onSelect={setSelectedTrack}
            selectedTrack={selectedTrack}
            onCloseModal={() => setSelectedTrack(null)}
          />
        )}
      </main>
    </div>
  )
}


function UploadView({ onSuccess }) {
  const [mode, setMode] = useState('file') // 'file' | 'url'
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleUpload = async () => {
    setIsLoading(true)
    setError(null)

    try {
      let res;
      if (mode === 'file') {
        if (!file) return;
        const formData = new FormData()
        formData.append('file', file)
        res = await axios.post(`${API_BASE}/separate`, formData)
      } else {
        if (!url) return;
        res = await axios.post(`${API_BASE}/separate-url`, { url })
      }
      onSuccess(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error processing request')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="upload-container">
      <div className="mode-toggle">
        <button
          className={`toggle-btn ${mode === 'file' ? 'active' : ''}`}
          onClick={() => setMode('file')}
        >
          Upload File
        </button>
        <button
          className={`toggle-btn ${mode === 'url' ? 'active' : ''}`}
          onClick={() => setMode('url')}
        >
          Youtube URL
        </button>
      </div>

      <div className="upload-box">
        {mode === 'file' ? (
          <>
            <input
              type="file"
              accept=".mp3,.wav,.ogg,.flac"
              onChange={(e) => setFile(e.target.files[0])}
              id="file-input"
              className="hidden-input"
            />
            <label htmlFor="file-input" className="upload-label">
              {file ? file.name : 'Click or Drag Audio File'}
            </label>
          </>
        ) : (
          <input
            type="text"
            placeholder="Paste Youtube Link..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="url-input"
          />
        )}

        <button
          onClick={handleUpload}
          disabled={(mode === 'file' && !file) || (mode === 'url' && !url) || isLoading}
          className="primary-btn"
        >
          {isLoading ? 'Processing...' : 'Start Separation'}
        </button>
      </div>
      {isLoading && <div className="loader">Processing your track... this may take a few minutes.</div>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

function LibraryView({ items, refresh, onSelect, selectedTrack, onCloseModal }) {
  const [search, setSearch] = useState('')

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="library-container">
      <div className="search-bar">
        <input
          type="search"
          placeholder="Search library..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="library-grid">
        {filteredItems.map(item => (
          <div key={item.id} className="track-card" onClick={() => onSelect(item)}>
            <h3 className="track-title" title={item.name}>{item.name}</h3>
            <span className="date">{item.date.split('_')[0]}</span>
            <div className="stem-count">{item.stems.length} Stems</div>
          </div>
        ))}

        {selectedTrack && (
          <PlayerModal
            track={selectedTrack}
            onClose={onCloseModal}
            onRefresh={refresh}
          />
        )}
      </div>
    </div>
  )
}

function PlayerModal({ track, onClose, onRefresh }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [checkedStems, setCheckedStems] = useState({})
  const [stemVolumes, setStemVolumes] = useState({})
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const [masterVolume, setMasterVolume] = useState(1.0)
  const audioRefs = useRef({})
  const sliderRef = useRef(false) // Semaphore for slider dragging
  const lastTrackIdRef = useRef(null)

  // Initialize checks and volumes
  useEffect(() => {
    // Check if we are checking the same track (just refreshed) or a new one
    const isSameTrack = lastTrackIdRef.current === track.id

    if (isSameTrack) {
      // Persist existing state, add new stems as checked by default
      setCheckedStems(prev => {
        const next = { ...prev }
        track.stems.forEach(s => {
          if (next[s] === undefined) next[s] = true
        })
        return next
      })
      setStemVolumes(prev => {
        const next = { ...prev }
        track.stems.forEach(s => {
          if (next[s] === undefined) next[s] = 1.0
        })
        return next
      })
    } else {
      // New track loaded, reset everything
      const initialChecks = {}
      const initialVols = {}
      track.stems.forEach(s => {
        initialChecks[s] = true
        initialVols[s] = 1.0
      })
      setCheckedStems(initialChecks)
      setStemVolumes(initialVols)
    }

    lastTrackIdRef.current = track.id

    // Stop audio on cleanup of the COMPONENT (not effect re-run, unless we handle it mostly via refs)
    // Actually, we want to stop audio if we switch tracks entirely?
    // The previous cleanup logic was:
    // return () => { Object.values(audioRefs.current).forEach(...) }
    // This runs before every effect execution.
    // If we are refreshing, we might NOT want to stop audio?
    // "So the tracks selected will sound there" -> implies continuity?
    // If I just Unify, the list updates. The <audio> elements are re-rendered because the `stems` list map changed?
    // The `key` is `stem` name. Existing stems have same keys. React preserves them.
    // BUT, the `src` attribute depends on `track.id`? No, track.id is same.
    // So <audio> shouldn't remount for existing stems.

    // HOWEVER, this useEffect cleanup runs every time 'track' changes (which it does on refresh).
    // So it PAUSES everything.
    // We should prevent pausing if it is the same track.

    return () => {
      // Only pause if we are actually unmounting or changing tracks
      // But cleanup doesn't know the NEXT state.
      // We can rely on the fact that if we stay on same track, the new effect run will restore state?
      // No, `audio.pause()` stops playback.

      // If we want seamless playback during Unify, we must avoid `audio.pause()` here.
      // But how to detect?
      // We can check `lastTrackIdRef.current`? No, that's updated.

      // Simplest fix for now: The user said "persist selected", didn't explicitly demand "continuous playback without interruption".
      // But resetting playback is annoying.

      // If I remove the cleanup pause, I risk playing audio forever if component unmounts.
      // But `useEffect(() => {}, [])` (mount/unmount) could handle unmount cleanup.
      // This effect is `[track]`.

      // Let's separate the cleanup logic.
    }
  }, [track])

  // New effect for unmount cleanup ONLY
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        if (audio) {
          audio.pause()
          audio.currentTime = 0
        }
      })
    }
  }, [])

  // Audio Play/Pause sync effect handles the rest.

  // Sync Play/Pause
  useEffect(() => {
    Object.values(audioRefs.current).forEach(audio => {
      if (!audio) return
      if (isPlaying) audio.play().catch(e => console.warn(e))
      else audio.pause()
    })
  }, [isPlaying])

  // Sync Muting (via checkbox)
  useEffect(() => {
    Object.entries(audioRefs.current).forEach(([stem, audio]) => {
      if (!audio) return
      audio.muted = !checkedStems[stem]
    })
  }, [checkedStems])

  // Sync Volume
  useEffect(() => {
    Object.entries(audioRefs.current).forEach(([stem, audio]) => {
      if (!audio) return
      // If unmuted, set volume. If muted, muted property handles it, but we keep volume state ready.
      if (stemVolumes[stem] !== undefined) {
        audio.volume = Math.max(0, Math.min(1, stemVolumes[stem] * masterVolume))
      }
    })
  }, [stemVolumes, masterVolume])

  const handleTimeUpdate = (e) => {
    // Only let the first loaded track drive the UI to avoid jitter
    if (sliderRef.current) return

    // Find the first playing track to be the master clock
    // Or just use the event target if it's one of the active stems
    // Simple approach: Use duration from event, update current time
    const t = e.target.currentTime
    const d = e.target.duration

    // Update global state
    setCurrentTime(t)
    if (d > 0 && d !== duration) setDuration(d)
  }

  const handleSliderChange = (e) => {
    const v = parseFloat(e.target.value)
    setCurrentTime(v)
    Object.values(audioRefs.current).forEach(audio => {
      if (audio && Number.isFinite(audio.duration)) {
        audio.currentTime = v
      }
    })
  }

  const handleSliderInput = () => { sliderRef.current = true }
  const handleSliderRelease = (e) => {
    sliderRef.current = false
    handleSliderChange(e)
  }

  const toggleCheck = (stemName) => {
    setCheckedStems(prev => ({ ...prev, [stemName]: !prev[stemName] }))
  }

  const handleVolumeChange = (stemName, val) => {
    setStemVolumes(prev => ({ ...prev, [stemName]: parseFloat(val) }))
  }

  const handleSelectAll = () => {
    const allSelected = {}
    track.stems.forEach(s => allSelected[s] = true)
    setCheckedStems(allSelected)
  }

  const handleUnselectAll = () => {
    const allUnselected = {}
    track.stems.forEach(s => allUnselected[s] = false)
    setCheckedStems(allUnselected)
  }

  const handleUnify = async () => {
    const activeTracks = track.stems.filter(s => checkedStems[s])
    if (activeTracks.length === 0) return alert("Select at least one track to unify.")

    // Check if any selected track is already a unified track
    const hasUnified = activeTracks.some(s => s.includes('.unified'))
    if (hasUnified) {
      return alert("Unified tracks cannot be re-unified")
    }
    try {
      await axios.post(`${API_BASE}/unify`, { id: track.id, tracks: activeTracks })
      // Refresh library to show new track
      if (onRefresh) onRefresh()
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        alert(err.response.data.error)
      } else {
        alert("Error unifying tracks")
      }
    }
  }

  const downloadSelectedZip = async () => {
    const activeTracks = track.stems.filter(s => checkedStems[s])
    if (activeTracks.length === 0) return alert("Select at least one track to download.")
    try {
      const res = await axios.post(`${API_BASE}/zip-selected`, { id: track.id, tracks: activeTracks }, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${track.name}_selected.zip`)
      document.body.appendChild(link)
      link.click()
    } catch (err) { alert("Error generating zip") }
  }

  const downloadZip = () => { window.location.href = `${API_BASE}/zip/${track.id}` }
  const formatTime = (t) => {
    const min = Math.floor(t / 60)
    const sec = Math.floor(t % 60)
    return `${min}:${sec < 10 ? '0' + sec : sec}`
  }

  // Close handler to stop music
  const closeSelf = () => {
    setIsPlaying(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={closeSelf}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{track.name}</h2>
          <button onClick={closeSelf} className="close-btn">×</button>
        </div>

        <div className="timeline-container">
          <span className="time-label">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            className="timeline-slider"
            onChange={handleSliderChange}
            onInput={handleSliderInput}
            onMouseUp={handleSliderRelease}
            onTouchEnd={handleSliderRelease}
          />
          <span className="time-label">{formatTime(duration)}</span>
        </div>

        <div className="controls-global">
          <div className="controls-left">
            {track.original && (
              <a
                href={`${API_BASE}/download/${track.id}/${track.original}`}
                download
                className="download-original-btn"
                title="Download Original File"
              >
                <img className="download-icon" src="src/assets/download.png" alt="download icon" />
                Download Original
              </a>
            )}
          </div>
            <button className={`play-btn ${isPlaying ? 'playing' : ''}`} onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

          <div className="volume-control-global">
            <VolumeIcon />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="master-volume-slider"
              title="Master Volume"
            />
          </div>
        </div>

        <div className="stems-list">

          <div className="modal-actions-bar">
            <div className="selection-controls">
              <button
                className="btn-ghost"
                onClick={handleSelectAll}
              >
                Select All
              </button>
              <button
                className="btn-ghost"
                onClick={handleUnselectAll}
              >
                Unselect All
              </button>
            </div>

            <div className="main-actions">
              <button
                className="btn-secondary"
                onClick={handleUnify}
                title="Create a new track from selected stems"
              >
                <img className="download-icon" src="src/assets/join.png" alt="download icon" />
                <div>Unify Tracks</div>
              </button>

              <div className="dropdown-container">
                <button className="btn-secondary dropdown-btn">
                  <img className="download-icon" src="src/assets/download.png" alt="download icon" />
                  <div>Download</div>
                </button>
                <div className="dropdown-content">
                  <button onClick={downloadSelectedZip}>Download Selected (ZIP)</button>
                  <button onClick={downloadZip}>Download All (ZIP)</button>
                </div>
              </div>
            </div>
          </div>
          {track.stems.map((stem, index) => (
            <div key={stem} className={`stem-row ${!checkedStems[stem] ? 'dimmed' : ''}`}>
              <div className="stem-left-controls">
                <input
                  type="checkbox"
                  checked={!!checkedStems[stem]}
                  onChange={() => toggleCheck(stem)}
                  className="stem-checkbox"
                />
                <span className="stem-name-small">
                  {stem.replace('.wav', '').replace('.unified', '')}
                  {stem.includes('.unified') && <span className="unified-tag">Unified</span>}
                </span>
              </div>

              {/* Hidden Audio Element for Player Logic */}
              <audio
                ref={el => audioRefs.current[stem] = el}
                src={`${API_BASE}/download/${track.id}/${stem}`}
                onTimeUpdate={index === 0 ? handleTimeUpdate : undefined}
                onEnded={() => setIsPlaying(false)}
                preload="auto"
              />

              {/* Just a progress bar visual instead of waveform? Or just empty? 
                  User said "version without wavesurfer". We can just show the slider and volume. 
              */}

              <div className="stem-controls" style={{ marginLeft: 'auto' }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={stemVolumes[stem] !== undefined ? stemVolumes[stem] : 1.0}
                  onChange={(e) => handleVolumeChange(stem, e.target.value)}
                  className="volume-slider"
                  title="Volume"
                />
                <a
                  href={`${API_BASE}/download/${track.id}/${stem}`}
                  download
                  className="stem-download"
                  title="Download Stem"
                >
                  <DownloadIcon />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div >
  )
}

export default App
