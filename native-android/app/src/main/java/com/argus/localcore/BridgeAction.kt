package com.argus.localcore

data class BridgeAction(
    val id: String,
    val title: String,
    val capability: String,
    val status: String,
    val sensitivity: String,
    val requiresConfirmation: Boolean
)

