import React, { useState, useEffect } from 'react';
import SetupPage from './pages/SetupPage';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';

export default function App() {
  const [page, setPage] = useState('setup');
  const [user, setUser] = useState(null);
  const [room, setRoom] = useState(null); // { name, host, port, isHost, password }

  useEffect(() => {
    const saved = localStorage.getItem('lw_user');
    if (saved) {
      setUser(JSON.parse(saved));
      setPage('lobby');
    }
  }, []);

  const handleSetupDone = (userData) => {
    setUser(userData);
    localStorage.setItem('lw_user', JSON.stringify(userData));
    setPage('lobby');
  };

  const handleJoinRoom = (roomData) => {
    setRoom(roomData);
    setPage('room');
  };

  const handleLeaveRoom = () => {
    setRoom(null);
    setPage('lobby');
  };

  return (
    <div className="app">
      <div className="ambient ambient-1" />
      <div className="ambient ambient-2" />
      <div className="titlebar" />
      <div className="page">
        {page === 'setup' && <SetupPage onDone={handleSetupDone} />}
        {page === 'lobby' && (
          <LobbyPage user={user} onJoinRoom={handleJoinRoom} onChangeUser={() => setPage('setup')} />
        )}
        {page === 'room' && (
          <RoomPage user={user} room={room} onLeave={handleLeaveRoom} />
        )}
      </div>
    </div>
  );
}
