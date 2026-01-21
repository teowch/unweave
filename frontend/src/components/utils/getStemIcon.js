import drumsIcon from '../../assets/instruments/drums.png';
import guitarIcon from '../../assets/instruments/guitar.png';
import bassIcon from '../../assets/instruments/bass.png';
import vocalIcon from '../../assets/instruments/vocal.png';
import pianoIcon from '../../assets/instruments/piano.png';
import otherIcon from '../../assets/instruments/other.png';
import instrumentalIcon from '../../assets/instruments/instrumental.png';
import musicIcon from '../../assets/instruments/music.png';

// Icon mapping for instrument types
const icons = {
    drums: drumsIcon,
    bass: bassIcon,
    guitar: guitarIcon,
    vocal: vocalIcon,
    piano: pianoIcon,
    other: otherIcon,
    instrumental: instrumentalIcon
};

// Valid instrument types for grouping
const validTypes = Object.keys(icons);

/**
 * Extract instrument type from stem name (format: stem_name.instrument.extension)
 */
export const getInstrumentType = (stemName) => {
    const parts = stemName.toLowerCase().split('.');
    if (parts.length >= 2) {
        const instrument = parts[parts.length - 2];
        if (validTypes.includes(instrument)) {
            return instrument;
        }
    }
    return 'music';
};

/**
 * Get the icon for a stem based on its name
 */
const getStemIcon = (stemName) => {
    const type = getInstrumentType(stemName);
    return icons[type] || musicIcon;
};

/**
 * Get the icon for an instrument type directly
 */
export const getIconForType = (type) => {
    return icons[type] || musicIcon;
};

export default getStemIcon;
