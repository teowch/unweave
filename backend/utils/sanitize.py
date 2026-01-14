import os

def get_ascii_prefix(text: str, length: int = 2) -> str:
    """
    Extract the first `length` ASCII characters from `text`, skipping non-ASCII characters.
    Returns up to `length` ASCII chars, or fewer if not enough ASCII chars exist.
    """
    result = []
    for char in text:
        if char.isascii() and char.isalnum():
            result.append(char)
            if len(result) >= length:
                break
    return ''.join(result) if result else 'xx'

def sanitize_filename(filename: str) -> str:
    """
    Remove non-ASCII characters from filename, keeping only ASCII alphanumeric,
    underscores, hyphens, and dots. Preserves the file extension.
    """
    name, ext = os.path.splitext(filename)
    
    # Filter to only ASCII-safe characters
    sanitized = ''.join(
        char for char in name 
        if char.isascii() and (char.isalnum() or char in '_-')
    )
    
    # Fallback if completely empty
    if not sanitized:
        sanitized = 'file'
    
    return sanitized + ext