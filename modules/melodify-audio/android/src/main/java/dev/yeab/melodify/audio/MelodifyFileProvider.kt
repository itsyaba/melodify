package dev.yeab.melodify.audio

import androidx.core.content.FileProvider

/** Its own class, so its manifest entry cannot collide with another library's FileProvider. */
class MelodifyFileProvider : FileProvider()
