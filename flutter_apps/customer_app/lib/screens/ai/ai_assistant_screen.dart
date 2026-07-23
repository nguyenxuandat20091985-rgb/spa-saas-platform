import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_indicator.dart';
import 'package:spa_shared/utils/date_utils.dart';
import 'package:spa_shared/utils/input_utils.dart';
import '../../bloc/ai/ai_bloc.dart';
import '../../bloc/ai/ai_event.dart';
import '../../bloc/ai/ai_state.dart';
import '../../models/ai_message.dart';
import '../../widgets/ai_message_bubble.dart';
import '../../widgets/suggestion_chip.dart';
import '../../widgets/typing_indicator.dart';

class AiAssistantScreen extends StatefulWidget {
  const AiAssistantScreen({super.key});

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen>
    with AutomaticKeepAliveClientMixin {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();
  bool _isTyping = false;
  bool _isSending = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    // Load conversation history
    context.read<AiBloc>().add(const LoadConversationHistoryEvent());
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _messageController.text.trim();
    if (text.isEmpty || _isSending) return;

    _messageController.clear();
    _focusNode.requestFocus();

    context.read<AiBloc>().add(SendMessageEvent(text: text));

    // Auto-scroll to bottom
    _scrollToBottom();
  }

  void _scrollToBottom() {
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

  void _handleSuggestionTap(String suggestion) {
    _messageController.text = suggestion;
    _sendMessage();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: const BoxDecoration(
                color: AppColors.success,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'Beauty AI',
              style: GoogleFonts.playfairDisplay(
                fontSize: 20,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.face_retouching_natural),
            onPressed: () => _navigateToSkinAnalysis(context),
            tooltip: 'Phân tích da',
          ),
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () => _navigateToHistory(context),
            tooltip: 'Lịch sử',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              context.read<AiBloc>().add(const ClearConversationEvent());
            },
            tooltip: 'Bắt đầu mới',
          ),
        ],
      ),
      body: BlocConsumer<AiBloc, AiState>(
        listener: (context, state) {
          if (state is AiMessageSent) {
            _scrollToBottom();
          }
          if (state is AiError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.red,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
        builder: (context, state) {
          return Column(
            children: [
              // Message List
              Expanded(
                child: state is AiLoading && state.isInitial
                    ? const Center(
                        child: LoadingIndicator(
                          message: 'Đang kết nối trợ lý AI...',
                        ),
                      )
                    : _buildMessageList(context, state),
              ),

              // Input Area
              _buildInputArea(context),
            ],
          );
        },
      ),
    );
  }

  Widget _buildMessageList(BuildContext context, AiState state) {
    final messages = state is AiLoaded ? state.messages : <AiMessage>[];

    if (messages.isEmpty && !(state is AiLoading)) {
      return _buildWelcomeScreen(context);
    }

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: messages.length + (state is AiLoading ? 1 : 0),
      itemBuilder: (ctx, index) {
        // Show typing indicator at the end
        if (state is AiLoading && index == messages.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TypingIndicator(),
            ),
          );
        }

        final message = messages[index];
        return AiMessageBubble(
          message: message,
          isUser: message.isUser,
          timestamp: message.createdAt,
          onQuickAction: _handleSuggestionTap,
        );
      },
    );
  }

  Widget _buildWelcomeScreen(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primary, AppColors.primaryDark],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(28),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.3),
                    blurRadius: 20,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: const Icon(
                Icons.auto_awesome,
                color: Colors.white,
                size: 52,
              ),
            ),
            const SizedBox(height: 28),
            Text(
              'Beauty AI Assistant',
              style: GoogleFonts.playfairDisplay(
                fontSize: 30,
                fontWeight: FontWeight.bold,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Chuyên gia tư vấn làm đẹp AI\ncá nhân hóa cho bạn',
              style: GoogleFonts.inter(
                color: AppColors.textSecondary,
                fontSize: 15,
                height: 1.6,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            // Suggestion chips
            Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                SuggestionChip(
                  label: 'Da dầu nên dùng sản phẩm gì?',
                  icon: Icons.opacity,
                  onTap: () => _handleSuggestionTap('Da dầu nên dùng sản phẩm gì?'),
                ),
                SuggestionChip(
                  label: 'Cách trị mụn hiệu quả nhất?',
                  icon: Icons.healing,
                  onTap: () => _handleSuggestionTap('Cách trị mụn hiệu quả nhất?'),
                ),
                SuggestionChip(
                  label: 'Phân tích tình trạng da',
                  icon: Icons.face_retouching_natural,
                  onTap: () => _handleSuggestionTap('Phân tích tình trạng da của em'),
                ),
                SuggestionChip(
                  label: 'Dịch vụ spa phù hợp với em',
                  icon: Icons.spa,
                  onTap: () => _handleSuggestionTap('Đề xuất dịch vụ spa phù hợp với em'),
                ),
                SuggestionChip(
                  label: 'Quy trình skincare cho người mới',
                  icon: Icons.auto_awesome,
                  onTap: () => _handleSuggestionTap('Quy trình skincare cho người mới bắt đầu'),
                ),
                SuggestionChip(
                  label: 'Sản phẩm chống nắng tốt nhất',
                  icon: Icons.wb_sunny,
                  onTap: () => _handleSuggestionTap('Sản phẩm chống nắng tốt nhất'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Hoặc nhập câu hỏi của bạn bên dưới 👇',
              style: GoogleFonts.inter(
                color: AppColors.textSecondary,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputArea(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(
          top: BorderSide(
            color: AppColors.divider,
            width: 0.5,
          ),
        ),
      ),
      child: SafeArea(
        child: Row(
          children: [
            IconButton(
              icon: const Icon(
                Icons.camera_alt_outlined,
                color: AppColors.textSecondary,
              ),
              onPressed: () => _handleImageUpload(context),
              tooltip: 'Chụp ảnh da',
            ),
            Expanded(
              child: TextField(
                controller: _messageController,
                focusNode: _focusNode,
                decoration: InputDecoration(
                  hintText: 'Hỏi Beauty AI...',
                  hintStyle: GoogleFonts.inter(
                    color: AppColors.textSecondary,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: Colors.grey[100],
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 12,
                  ),
                  suffixIcon: _messageController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(
                            Icons.close,
                            size: 18,
                            color: AppColors.textSecondary,
                          ),
                          onPressed: () {
                            _messageController.clear();
                            setState(() {});
                          },
                        )
                      : null,
                ),
                onChanged: (text) => setState(() {}),
                onSubmitted: (_) => _sendMessage(),
                textInputAction: TextInputAction.send,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primary, AppColors.primaryDark],
                ),
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: IconButton(
                icon: const Icon(
                  Icons.send,
                  color: Colors.white,
                  size: 20,
                ),
                onPressed: _sendMessage,
                tooltip: 'Gửi tin nhắn',
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ==========================================
  // NAVIGATION METHODS
  // ==========================================

  void _navigateToSkinAnalysis(BuildContext context) {
    Navigator.pushNamed(context, '/skin-analysis');
  }

  void _navigateToHistory(BuildContext context) {
    Navigator.pushNamed(context, '/ai-history');
  }

  void _handleImageUpload(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Phân tích da với AI',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            const Text(
              'Chụp ảnh da của bạn để AI phân tích',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildImageOption(
                  icon: Icons.camera_alt,
                  label: 'Chụp ảnh',
                  onTap: () {
                    Navigator.pop(context);
                    // Navigate to camera
                  },
                ),
                _buildImageOption(
                  icon: Icons.photo_library,
                  label: 'Chọn ảnh',
                  onTap: () {
                    Navigator.pop(context);
                    // Navigate to gallery
                  },
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildImageOption({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.06),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppColors.primary.withOpacity(0.15),
          ),
        ),
        child: Column(
          children: [
            Icon(icon, size: 32, color: AppColors.primary),
            const SizedBox(height: 8),
            Text(
              label,
              style: GoogleFonts.inter(
                color: AppColors.primary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}