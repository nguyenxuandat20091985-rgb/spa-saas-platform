import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';

class AiAssistantScreen extends StatefulWidget {
  const AiAssistantScreen({super.key});

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  final List<_Message> _messages = [];

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _messages.add(_Message(text: text, isUser: true));
      _messages.add(_Message(
        text: 'Xin chào! Em là Beauty AI Assistant, chuyên gia tư vấn làm đẹp cá nhân của chị.\n\nEm có thể giúp chị:\n- Phân tích tình trạng da\n- Tư vấn dịch vụ phù hợp\n- Đề xuất sản phẩm skincare\n- Đặt lịch hẹn\n\nChị cần em tư vấn gì ạ?',
        isUser: false,
      ));
      _messageController.clear();
    });

    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8, height: 8,
              decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Text('Beauty AI', style: GoogleFonts.playfairDisplay()),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.face_retouching_natural), onPressed: () {}, tooltip: 'Phân tích da'),
          IconButton(icon: const Icon(Icons.history), onPressed: () {}, tooltip: 'Lịch sử'),
        ],
      ),
      body: Column(
        children: [
          // Welcome
          if (_messages.isEmpty)
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.primary, AppColors.primaryDark],
                          ),
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: const Icon(Icons.auto_awesome, color: Colors.white, size: 48),
                      ),
                      const SizedBox(height: 24),
                      Text('Beauty AI Assistant', style: GoogleFonts.playfairDisplay(fontSize: 28)),
                      const SizedBox(height: 8),
                      const Text(
                        'Chuyên gia tư vấn làm đẹp AI\ncá nhân hóa cho bạn',
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),
                      // Suggestion chips
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        alignment: WrapAlignment.center,
                        children: [
                          _SuggestionChip(label: 'Da dầu nên dùng gì?', onTap: () { _messageController.text = 'Da dầu nên dùng sản phẩm gì?'; _sendMessage(); }),
                          _SuggestionChip(label: 'Cách trị mụn hiệu quả', onTap: () { _messageController.text = 'Cách trị mụn hiệu quả nhất?'; _sendMessage(); }),
                          _SuggestionChip(label: 'Phân tích da cho em', onTap: () { _messageController.text = 'Em muốn phân tích tình trạng da'; _sendMessage(); }),
                          _SuggestionChip(label: 'Đề xuất dịch vụ', onTap: () { _messageController.text = 'Đề xuất dịch vụ phù hợp với em'; _sendMessage(); }),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                itemCount: _messages.length,
                itemBuilder: (ctx, i) {
                  final msg = _messages[i];
                  return Align(
                    alignment: msg.isUser ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(14),
                      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                      decoration: BoxDecoration(
                        color: msg.isUser ? AppColors.primary : AppColors.surface,
                        borderRadius: BorderRadius.circular(18).copyWith(
                          bottomRight: msg.isUser ? const Radius.circular(4) : null,
                          bottomLeft: !msg.isUser ? const Radius.circular(4) : null,
                        ),
                        border: msg.isUser ? null : Border.all(color: AppColors.divider),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.05),
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (!msg.isUser)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.auto_awesome, size: 14, color: AppColors.primary),
                                  const SizedBox(width: 4),
                                  Text('Beauty AI', style: GoogleFonts.inter(fontSize: 11, color: AppColors.primary, fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                          Text(
                            msg.text,
                            style: TextStyle(
                              color: msg.isUser ? Colors.white : AppColors.textPrimary,
                              fontSize: 14,
                              height: 1.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

          // Input
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border(top: BorderSide(color: AppColors.divider)),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.camera_alt_outlined, color: AppColors.textSecondary),
                    onPressed: () {},
                    tooltip: 'Chụp ảnh da',
                  ),
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      decoration: InputDecoration(
                        hintText: 'Hỏi Beauty AI...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [AppColors.primary, AppColors.primaryDark]),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.send, color: Colors.white, size: 20),
                      onPressed: _sendMessage,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SuggestionChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _SuggestionChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
        ),
        child: Text(label, style: const TextStyle(color: AppColors.primary, fontSize: 13)),
      ),
    );
  }
}

class _Message {
  final String text;
  final bool isUser;
  _Message({required this.text, required this.isUser});
}
