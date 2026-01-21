import React, { useEffect, useState } from 'react';
import { XIcon, CopyIcon, ExternalLinkIcon } from '../common/Icons';
import pixQrCode from '../../assets/pix-qr.jpeg';

const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/teowch';
const PIX_KEY = '00020126870014br.gov.bcb.pix01367acef823-51cd-4e43-bc5a-c5bf30454b340225Sponsor github.com/teowch5204000053039865802BR5925TEODORO VALENCA DE SOUZA 6015SAO BENTO DO SU62210517SponsoredAtGithub6304C8DF';

const SupportModal = ({ isOpen, onClose }) => {
    const [copiedPix, setCopiedPix] = useState(false);

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleCopyPix = async () => {
        try {
            await navigator.clipboard.writeText(PIX_KEY);
            setCopiedPix(true);
            setTimeout(() => setCopiedPix(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleOpenGitHub = () => {
        window.open(GITHUB_SPONSORS_URL, '_blank', 'noopener,noreferrer');
    };

    if (!isOpen) return null;

    return (
        <div className="support-modal-overlay" onClick={handleOverlayClick}>
            <div className="support-modal">
                <div className="support-modal-header">
                    <h2>Support Project</h2>
                    <button className="support-modal-close" onClick={onClose} aria-label="Close">
                        <XIcon size={20} />
                    </button>
                </div>

                <div className="support-modal-content">
                    <p className="support-info-text">
                        This is a personal project maintained in my free time.
                        Any form of support is entirely optional.
                    </p>

                    <div className="support-options">
                        {/* GitHub Sponsors - Primary */}
                        <div className="support-option support-option-primary">
                            <div className="support-option-header">
                                <svg className="github-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                                <span className="support-option-title">GitHub Sponsors</span>
                            </div>
                            <p className="support-option-desc">Support through GitHub's sponsorship program</p>
                            <button className="support-btn support-btn-primary" onClick={handleOpenGitHub}>
                                <span>Open GitHub Sponsors</span>
                                <ExternalLinkIcon size={16} />
                            </button>
                        </div>

                        {/* PIX - Secondary */}
                        <div className="support-option">
                            <div className="support-option-header">
                                <span className="pix-badge">PIX</span>
                                <span className="support-option-title">PIX (Brazil)</span>
                            </div>
                            <p className="support-option-desc">Brazilian instant payment method</p>
                            <div className="pix-content">
                                <img src={pixQrCode} alt="PIX QR Code" className="pix-qr-code" />
                                <button className="support-btn support-btn-secondary" onClick={handleCopyPix}>
                                    <CopyIcon size={16} />
                                    <span>{copiedPix ? 'Copied!' : 'Copy PIX Key'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupportModal;
