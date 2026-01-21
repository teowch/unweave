import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { HeartIcon } from '../common/Icons';
import SupportModal from './SupportModal';
import './Sidebar.css';

const Sidebar = () => {
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          UNWEAVE
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3 className="section-title">Menu</h3>
            <NavLink to="/split" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </span>
              <span className="nav-label">Split New Track</span>
            </NavLink>
            <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
              </span>
              <span className="nav-label">Library</span>
            </NavLink>
            <NavLink to="/models" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
              </span>
              <span className="nav-label">Models</span>
            </NavLink>
          </div>
        </nav>

        <div className="sidebar-footer">
          <button
            className="nav-item support-nav-item"
            onClick={() => setIsSupportModalOpen(true)}
          >
            <span className="nav-icon">
              <HeartIcon size={20} />
            </span>
            <span className="nav-label">Support Project</span>
          </button>
        </div>
      </aside>

      <SupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
      />
    </>
  );
};

export default Sidebar;

