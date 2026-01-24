import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { HeartIcon, UploadIcon, EditIcon, PackageIcon, SlidersIcon } from '../common/Icons';
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
                <UploadIcon size={20} />
              </span>
              <span className="nav-label">Split New Track</span>
            </NavLink>
            <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">
                <EditIcon size={20} />
              </span>
              <span className="nav-label">Library</span>
            </NavLink>
            <NavLink to="/models" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">
                <PackageIcon size={20} />
              </span>
              <span className="nav-label">Models</span>
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">
                <SlidersIcon size={20} />
              </span>
              <span className="nav-label">Settings</span>
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

