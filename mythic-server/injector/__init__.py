#!/usr/bin/env python3
"""
ATMA Injector Module
Live fully functional injector for XMP metadata injection with Mythic and Codeine AI integration.

This module provides:
- XMP metadata injection for JPEG, PNG, and WebP images
- Integration with Mythic penetration testing platform
- Integration with Codeine AI assistant for adaptive payload generation
- Web app integration for browser-based operations
- Batch processing capabilities
- Real-time tracking and logging
"""

from .ps_instructions_inject import (
    PayloadGenerator,
    MythicIntegration,
    CodeineClient,
    WebAppIntegration,
    MythicConfig,
    inject_jpeg,
    inject_png,
    inject_webp,
    build_xmp_xml,
    build_supporting_fields,
    analyze_image,
    main
)

__version__ = "1.0.0"
__author__ = "ATMA Project"
__description__ = "XMP Field Injector with Mythic and Codeine AI Integration"

# Export main classes and functions
__all__ = [
    'PayloadGenerator',
    'MythicIntegration',
    'CodeineClient',
    'WebAppIntegration',
    'MythicConfig',
    'inject_jpeg',
    'inject_png',
    'inject_webp',
    'build_xmp_xml',
    'build_supporting_fields',
    'analyze_image',
    'main'
]
