package com.mototaxi.controller;

import com.mototaxi.config.RealtimeWebSocketHandler;
import com.mototaxi.model.ChatMessage;
import com.mototaxi.repository.ChatMessageRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rides/{rideId}/messages")
@CrossOrigin(origins = "*")
public class ChatController {

    private final ChatMessageRepository chatMessageRepository;
    private final RealtimeWebSocketHandler realtimeWebSocketHandler;

    public ChatController(ChatMessageRepository chatMessageRepository, RealtimeWebSocketHandler realtimeWebSocketHandler) {
        this.chatMessageRepository = chatMessageRepository;
        this.realtimeWebSocketHandler = realtimeWebSocketHandler;
    }

    @GetMapping
    public ResponseEntity<List<ChatMessage>> getMessages(@PathVariable Long rideId) {
        List<ChatMessage> messages = chatMessageRepository.findByRideIdOrderByTimestampAsc(rideId);
        return ResponseEntity.ok(messages);
    }

    @PostMapping
    public ResponseEntity<ChatMessage> sendMessage(@PathVariable Long rideId, @RequestBody Map<String, Object> payload) {
        String content = (String) payload.get("content");
        String senderName = (String) payload.getOrDefault("senderName", "Utilisateur");
        String senderRole = (String) payload.getOrDefault("senderRole", "CUSTOMER");
        Number senderIdNum = (Number) payload.getOrDefault("senderId", 1);
        Long senderId = senderIdNum.longValue();

        if (content == null || content.trim().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        ChatMessage msg = ChatMessage.builder()
                .rideId(rideId)
                .senderId(senderId)
                .senderName(senderName)
                .senderRole(senderRole)
                .content(content.trim())
                .build();

        msg = chatMessageRepository.save(msg);

        realtimeWebSocketHandler.broadcastToRide(String.valueOf(rideId), "chat:message", msg);

        return ResponseEntity.ok(msg);
    }
}
