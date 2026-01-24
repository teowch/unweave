import React, { useEffect, useState } from 'react';
import { XIcon, CopyIcon, ExternalLinkIcon, GithubIcon } from '../common/Icons';
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
                                <GithubIcon size={24} className="github-icon" />
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
