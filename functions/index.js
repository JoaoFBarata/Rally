const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// Trigger: New message created in conversations/{conversationId}/messages/{messageId}
exports.onMessageCreated = onDocumentCreated("conversations/{conversationId}/messages/{messageId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const message = snapshot.data();
    const conversationId = event.params.conversationId;
    const senderId = message.senderId;

    try {
        const convRef = db.collection("conversations").doc(conversationId);
        let memberIds = [];
        const cleanText = (message.text || "").trim() || "Enviou um anexo.";

        // Execute a server-side transaction to update conversation metadata safely
        await db.runTransaction(async (transaction) => {
            const convDoc = await transaction.get(convRef);
            if (!convDoc.exists) return;

            const convData = convDoc.data();
            memberIds = convData.memberIds || [];
            
            const currentUnreadFor = convData.unreadFor || [];
            const currentUnreadCounts = convData.unreadCounts || {};
            const receivers = memberIds.filter(id => id !== senderId);

            // Compute next unreadFor list
            const nextUnreadFor = [...new Set([
                ...currentUnreadFor.filter(id => id !== senderId),
                ...receivers
            ])];

            // Compute next unreadCounts Map
            const nextUnreadCounts = { ...currentUnreadCounts };
            for (const receiverId of receivers) {
                nextUnreadCounts[receiverId] = (nextUnreadCounts[receiverId] || 0) + 1;
            }
            nextUnreadCounts[senderId] = 0;

            // Clear typing state for sender
            const currentTyping = convData.typing || {};
            const nextTyping = { ...currentTyping };
            delete nextTyping[senderId];

            // Update conversation document
            transaction.update(convRef, {
                lastMessage: cleanText,
                lastSenderId: senderId,
                lastMessageAt: message.createdAt || FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                unreadFor: nextUnreadFor,
                unreadCounts: nextUnreadCounts,
                typing: nextTyping
            });
        });

        // Skip sending push notifications for system messages
        if (senderId === "rally-system") return;

        // Find the sender's display name
        const senderDoc = await db.collection("users").doc(senderId).get();
        const senderName = senderDoc.exists ? (senderDoc.data().displayName || "Alguém") : "Alguém";

        const recipients = memberIds.filter(id => id !== senderId);

        for (const recipientId of recipients) {
            const userDoc = await db.collection("users").doc(recipientId).get();
            if (!userDoc.exists) continue;

            const userData = userDoc.data();
            
            let tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];
            tokens = tokens.filter(t => typeof t === "string" && t.trim() !== "");

            if (tokens.length === 0) continue;

            const payload = {
                notification: {
                    title: `Nova mensagem de ${senderName}`,
                    body: cleanText
                },
                data: {
                    path: `/messages/${conversationId}`
                },
                android: {
                    notification: {
                        channelId: "rally_default_channel"
                    }
                }
            };

            for (const token of tokens) {
                try {
                    await messaging.send({
                        token: token,
                        ...payload
                    });
                    console.log(`Notification sent successfully to user ${recipientId}`);
                } catch (sendError) {
                    console.error(`Error sending push to token ${token} for user ${recipientId}:`, sendError);
                    if (sendError.code === "messaging/invalid-registration-token" || 
                        sendError.code === "messaging/registration-token-not-registered") {
                        await db.collection("users").doc(recipientId).update({
                            fcmTokens: FieldValue.arrayRemove(token)
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error in onMessageCreated Cloud Function:", error);
    }
});

// Trigger: New event invite created in eventInvites/{inviteId}
exports.onInviteCreated = onDocumentCreated("eventInvites/{inviteId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const invite = snapshot.data();
    const fromUserId = invite.fromUserId;
    const toUserId = invite.toUserId;
    const eventId = invite.eventId;

    try {
        // Get sender profile details
        const senderDoc = await db.collection("users").doc(fromUserId).get();
        const senderName = senderDoc.exists ? (senderDoc.data().displayName || "Um amigo") : "Um amigo";

        // Get event details
        const eventDoc = await db.collection("events").doc(eventId).get();
        const eventTitle = eventDoc.exists ? (eventDoc.data().title || "um evento") : "um evento";

        // Get recipient profile details
        const recipientDoc = await db.collection("users").doc(toUserId).get();
        if (!recipientDoc.exists) return;

        const recipientData = recipientDoc.data();
        
        let tokens = Array.isArray(recipientData.fcmTokens) ? recipientData.fcmTokens : [];
        tokens = tokens.filter(t => typeof t === "string" && t.trim() !== "");
        if (tokens.length === 0) return;

        const payload = {
            notification: {
                title: `Convite de Evento`,
                body: `${senderName} convidou-te para o evento "${eventTitle}"!`
            },
            data: {
                path: `/events/${eventId}`
            },
            android: {
                notification: {
                    channelId: "rally_default_channel"
                }
            }
        };

        for (const token of tokens) {
            try {
                await messaging.send({
                    token: token,
                    ...payload
                });
                console.log("Invite notification sent successfully");
            } catch (sendError) {
                console.error(`Error sending invite push:`, sendError);
                if (sendError.code === "messaging/invalid-registration-token" || 
                    sendError.code === "messaging/registration-token-not-registered") {
                    await db.collection("users").doc(toUserId).update({
                        fcmTokens: FieldValue.arrayRemove(token)
                    });
                }
            }
        }
    } catch (error) {
        console.error("Error in onInviteCreated Cloud Function:", error);
    }
});

// Helper: Send system message inside conversations
async function sendSystemMessage(userId, text) {
    const RALLY_SYSTEM_SENDER_ID = "rally-system";
    const conversationsRef = db.collection("conversations");
    
    // Check if system chat exists
    const querySnap = await conversationsRef
        .where("memberIds", "array-contains", userId)
        .where("type", "==", "rally_system")
        .limit(1)
        .get();

    let conversationId;
    if (querySnap.empty) {
        const newConvRef = conversationsRef.doc();
        conversationId = newConvRef.id;
        await newConvRef.set({
            type: "rally_system",
            memberIds: [userId],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            unreadFor: [userId],
            unreadCounts: {
                [userId]: 0
            }
        });
    } else {
        conversationId = querySnap.docs[0].id;
    }

    const cleanText = text.trim();

    // 1. Add system message document
    await conversationsRef.doc(conversationId).collection("messages").add({
        conversationId: conversationId,
        senderId: RALLY_SYSTEM_SENDER_ID,
        text: cleanText,
        createdAt: FieldValue.serverTimestamp()
    });

    // 2. Update conversation info
    const convDoc = await conversationsRef.doc(conversationId).get();
    const convData = convDoc.data();
    const currentUnreadCounts = convData.unreadCounts || {};
    const currentUnreadFor = convData.unreadFor || [];

    await conversationsRef.doc(conversationId).update({
        lastMessage: cleanText,
        lastSenderId: RALLY_SYSTEM_SENDER_ID,
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        unreadFor: [...new Set([...currentUnreadFor, userId])],
        unreadCounts: {
            ...currentUnreadCounts,
            [userId]: (currentUnreadCounts[userId] || 0) + 1
        }
    });
}

// Points Configuration
const RALLY_POINTS_CONFIG = {
    BASE_PARTICIPATION: 50,
    FIRST_VENUE_BONUS: 25,
    PER_PARTICIPANT: 2,
    PER_PARTICIPANT_CAP: 20,
    ORGANIZER_BONUS: 15,
    FULL_EVENT_BONUS: 10
};

// Helper: Secure Points Awarding via Server-side Transaction
async function awardPoints(
    userId,
    eventId,
    venueOrganizationId,
    venueName,
    eventTitle,
    participantCount,
    maxParticipants,
    isOrganizer
) {
    const txCollectionRef = db.collection("users").doc(userId).collection("pointTransactions");
    
    // Check if points already awarded for this event to avoid double allocation
    const alreadyAwardedSnap = await txCollectionRef.where("eventId", "==", eventId).limit(1).get();
    if (!alreadyAwardedSnap.empty) return;

    // Check if first visit to this venue
    const firstVisitSnap = await txCollectionRef.where("venueOrganizationId", "==", venueOrganizationId).limit(1).get();
    const isFirstVisit = firstVisitSnap.empty;

    // Calculate points details
    const base = RALLY_POINTS_CONFIG.BASE_PARTICIPATION;
    const firstVenueBonus = isFirstVisit ? RALLY_POINTS_CONFIG.FIRST_VENUE_BONUS : 0;
    
    const otherParticipants = Math.max(0, participantCount - 1);
    const participantBonus = Math.min(
        otherParticipants * RALLY_POINTS_CONFIG.PER_PARTICIPANT,
        RALLY_POINTS_CONFIG.PER_PARTICIPANT_CAP
    );
    
    const organizerBonus = isOrganizer ? RALLY_POINTS_CONFIG.ORGANIZER_BONUS : 0;
    const fullEventBonus = participantCount >= maxParticipants ? RALLY_POINTS_CONFIG.FULL_EVENT_BONUS : 0;
    
    const breakdown = { base, firstVenueBonus, participantBonus, organizerBonus, fullEventBonus };
    const total = base + firstVenueBonus + participantBonus + organizerBonus + fullEventBonus;

    const userRef = db.collection("users").doc(userId);

    // Apply transaction to atomically increment total points and write receipt log
    await db.runTransaction(async (tx) => {
        tx.update(userRef, {
            rallyPointsTotal: FieldValue.increment(total),
            updatedAt: FieldValue.serverTimestamp()
        });

        const newTxRef = txCollectionRef.doc();
        tx.set(newTxRef, {
            userId,
            eventId,
            venueOrganizationId,
            venueName,
            eventTitle,
            amount: total,
            breakdown,
            createdAt: FieldValue.serverTimestamp()
        });
    });
}

// Trigger: Event updated (Completion / Cancellation)
exports.onEventUpdated = onDocumentUpdated("events/{eventId}", async (event) => {
    const change = event.data;
    if (!change) return;

    const before = change.before.data();
    const after = change.after.data();
    const eventId = event.params.eventId;

    // Execute only if the event status changed
    if (before.status !== after.status) {
        const participantIds = after.participantIds || [];
        const eventTitle = after.title || "evento";
        const creatorId = after.creatorId;
        const hostType = after.hostType;
        const organizationId = after.organizationId || null;
        const venueName = after.venueName || "";

        // Case 1: Event was cancelled
        if (after.status === "cancelled") {
            for (const participantId of participantIds) {
                try {
                    await sendSystemMessage(participantId, `O evento "${eventTitle}" foi cancelado.`);
                } catch (err) {
                    console.error(`Error sending cancellation system message to user ${participantId}:`, err);
                }
            }
        }

        // Case 2: Event was finished
        if (after.status === "finished") {
            // Send event finished messages
            for (const participantId of participantIds) {
                try {
                    await sendSystemMessage(
                        participantId,
                        `O teu evento "${eventTitle}" terminou. Esperamos que tenha sido um bom jogo!`
                    );
                } catch (err) {
                    console.error(`Error sending completion system message to user ${participantId}:`, err);
                }
            }

            // Award Rally Points if the event took place in a verified venue organization
            if (hostType === "organization" && organizationId) {
                const maxParticipants = after.maxParticipants || 0;
                const participantCount = participantIds.length;

                for (const participantId of participantIds) {
                    try {
                        const isOrganizer = participantId === creatorId;
                        await awardPoints(
                            participantId,
                            eventId,
                            organizationId,
                            venueName,
                            eventTitle,
                            participantCount,
                            maxParticipants,
                            isOrganizer
                        );
                    } catch (err) {
                        console.error(`Error awarding points to user ${participantId} for event ${eventId}:`, err);
                    }
                }
            }
        }
    }
});
