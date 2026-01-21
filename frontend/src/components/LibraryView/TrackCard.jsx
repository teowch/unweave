import React from 'react';
import './LibraryView.css';

const TrackCard = ({ item }) => {
    return (
        <div className="track-card">
            <div className="card-art">
                {item.thumbnail ? (
                    <img src={item.thumbnail} alt={item.name} className="track-thumbnail" />
                ) : (
                    <div className="art-placeholder" style={{ background: `hsl(${item.name.length * 20}, 60%, 20%)` }}>
                        <span>{item.name.substring(0, 2).toUpperCase()}</span>
                    </div>
                )}
                <div className="play-overlay">
                    <span>▶</span>
                </div>
            </div>
            <div className="card-info">
                <h3 className="track-title" title={item.name}>{item.name}</h3>
                <div className="meta-row">
                    <span className="date">{item.date}</span>
                    <span className="stem-badge">{item.stems.length} Stems</span>
                </div>
            </div>
        </div>
    );
};

export default TrackCard;
