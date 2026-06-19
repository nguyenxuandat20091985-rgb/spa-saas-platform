import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';

class AiHubScreen extends StatelessWidget {
  const AiHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('AI Spa Brain', style: GoogleFonts.playfairDisplay()),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // AI Status Banner
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF667eea), Color(0xFF764ba2)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.auto_awesome, color: Colors.white, size: 28),
                      const SizedBox(width: 12),
                      Text('AI Spa Brain Cloud', style: GoogleFonts.playfairDisplay(
                        color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold,
                      )),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Trí tuệ nhân tạo chuyên biệt cho ngành Spa',
                    style: GoogleFonts.inter(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('Powered by AI', style: TextStyle(color: Colors.white, fontSize: 12)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // AI Modules
            Text('AI Modules', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),

            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.1,
              children: [
                _AiModuleCard(
                  icon: Icons.chat_bubble_outline,
                  title: 'AI Sales Consultant',
                  description: 'Tư vấn bán hàng, upsell, cross-sell',
                  color: const Color(0xFF3498DB),
                  onTap: () => _openAiChat(context, 'sales_consult'),
                ),
                _AiModuleCard(
                  icon: Icons.handshake_outlined,
                  title: 'AI Closing Agent',
                  description: 'Phân tích và kịch bản chốt sale',
                  color: const Color(0xFFE74C3C),
                  onTap: () => _openAiChat(context, 'closing'),
                ),
                _AiModuleCard(
                  icon: Icons.favorite_outline,
                  title: 'AI Customer Success',
                  description: 'Chăm sóc sau bán, tái khám',
                  color: const Color(0xFF27AE60),
                  onTap: () => _openAiChat(context, 'customer_success'),
                ),
                _AiModuleCard(
                  icon: Icons.campaign_outlined,
                  title: 'AI Marketing',
                  description: 'Tạo chiến dịch Facebook, TikTok, Zalo',
                  color: const Color(0xFFF39C12),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AiMarketingScreen())),
                ),
                _AiModuleCard(
                  icon: Icons.face_retouching_natural,
                  title: 'AI Skin Analysis',
                  description: 'Phân tích da bằng AI',
                  color: const Color(0xFF9B59B6),
                  onTap: () {},
                ),
                _AiModuleCard(
                  icon: Icons.trending_up,
                  title: 'AI Prediction',
                  description: 'Dự đoán doanh thu, churn risk',
                  color: const Color(0xFF1ABC9C),
                  onTap: () {},
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Knowledge Base
            Text('Knowledge Base', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            _KnowledgeSection(
              title: 'Sản phẩm',
              description: 'AI đã học về sản phẩm của bạn',
              icon: Icons.shopping_bag,
              count: 0,
              onTap: () {},
            ),
            const SizedBox(height: 8),
            _KnowledgeSection(
              title: 'Dịch vụ',
              description: 'AI đã học về dịch vụ của bạn',
              icon: Icons.spa,
              count: 0,
              onTap: () {},
            ),
            const SizedBox(height: 8),
            _KnowledgeSection(
              title: 'Tài liệu',
              description: 'PDF, DOCX, XLSX đã tải lên',
              icon: Icons.folder,
              count: 0,
              onTap: () {},
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.upload_file),
              label: const Text('Tải lên tài liệu đào tạo AI'),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  void _openAiChat(BuildContext context, String contextType) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AiChatScreen(contextType: contextType)),
    );
  }
}

class _AiModuleCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final Color color;
  final VoidCallback onTap;

  const _AiModuleCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.divider),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(height: 12),
            Text(title, style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 4),
            Text(description, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary), maxLines: 2),
          ],
        ),
      ),
    );
  }
}

class _KnowledgeSection extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final int count;
  final VoidCallback onTap;

  const _KnowledgeSection({
    required this.title,
    required this.description,
    required this.icon,
    required this.count,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.primary, size: 24),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
                  Text(description, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.primaryLight.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text('$count', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
  }
}

// AI Chat Screen
class AiChatScreen extends StatefulWidget {
  final String contextType;

  const AiChatScreen({super.key, required this.contextType});

  @override
  State<AiChatScreen> createState() => _AiChatScreenState();
}

class _AiChatScreenState extends State<AiChatScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  final List<_ChatMessage> _messages = [];
  bool _isLoading = false;

  String get _title {
    switch (widget.contextType) {
      case 'sales_consult': return 'AI Sales Consultant';
      case 'closing': return 'AI Closing Agent';
      case 'customer_success': return 'AI Customer Success';
      default: return 'AI Chat';
    }
  }

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
      _messages.add(_ChatMessage(text: text, isUser: true));
      _messages.add(_ChatMessage(
        text: 'Xin chào! Tôi là $_title. Hiện tại cần kết nối API để trả lời. Vui lòng cấu hình GEMINI_API_KEY.',
        isUser: false,
      ));
      _messageController.clear();
    });

    Future.delayed(const Duration(milliseconds: 100), () {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_title),
        actions: [
          IconButton(icon: const Icon(Icons.history), onPressed: () {}),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.auto_awesome, size: 64, color: AppColors.primary.withValues(alpha: 0.3)),
                        const SizedBox(height: 16),
                        Text(_title, style: GoogleFonts.playfairDisplay(fontSize: 24, color: AppColors.textPrimary)),
                        const SizedBox(height: 8),
                        const Text('Hãy bắt đầu cuộc trò chuyện', style: TextStyle(color: AppColors.textSecondary)),
                      ],
                    ),
                  )
                : ListView.builder(
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
                          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                          decoration: BoxDecoration(
                            color: msg.isUser ? AppColors.primary : AppColors.surface,
                            borderRadius: BorderRadius.circular(16).copyWith(
                              bottomRight: msg.isUser ? const Radius.circular(4) : null,
                              bottomLeft: !msg.isUser ? const Radius.circular(4) : null,
                            ),
                            border: msg.isUser ? null : Border.all(color: AppColors.divider),
                          ),
                          child: Text(
                            msg.text,
                            style: TextStyle(
                              color: msg.isUser ? Colors.white : AppColors.textPrimary,
                              fontSize: 14,
                              height: 1.5,
                            ),
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
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      decoration: InputDecoration(
                        hintText: 'Nhập tin nhắn...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.send, color: Colors.white),
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

class _ChatMessage {
  final String text;
  final bool isUser;

  _ChatMessage({required this.text, required this.isUser});
}

// AI Marketing Screen
class AiMarketingScreen extends StatefulWidget {
  const AiMarketingScreen({super.key});

  @override
  State<AiMarketingScreen> createState() => _AiMarketingScreenState();
}

class _AiMarketingScreenState extends State<AiMarketingScreen> {
  String _selectedChannel = 'facebook';
  String _selectedObjective = 'engagement';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AI Marketing')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Kênh marketing', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                _ChannelChip(label: 'Facebook', isSelected: _selectedChannel == 'facebook', onTap: () => setState(() => _selectedChannel = 'facebook')),
                _ChannelChip(label: 'TikTok', isSelected: _selectedChannel == 'tiktok', onTap: () => setState(() => _selectedChannel = 'tiktok')),
                _ChannelChip(label: 'Zalo', isSelected: _selectedChannel == 'zalo', onTap: () => setState(() => _selectedChannel = 'zalo')),
                _ChannelChip(label: 'SMS', isSelected: _selectedChannel == 'sms', onTap: () => setState(() => _selectedChannel = 'sms')),
                _ChannelChip(label: 'Email', isSelected: _selectedChannel == 'email', onTap: () => setState(() => _selectedChannel = 'email')),
              ],
            ),
            const SizedBox(height: 24),
            Text('Mục tiêu', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _selectedObjective,
              items: const [
                DropdownMenuItem(value: 'awareness', child: Text('Tăng nhận diện')),
                DropdownMenuItem(value: 'engagement', child: Text('Tăng tương tác')),
                DropdownMenuItem(value: 'conversion', child: Text('Tăng doanh thu')),
                DropdownMenuItem(value: 'retention', child: Text('Giữ chân khách')),
              ],
              onChanged: (v) => setState(() => _selectedObjective = v!),
              decoration: const InputDecoration(labelText: 'Mục tiêu chiến dịch'),
            ),
            const SizedBox(height: 16),
            const TextField(
              decoration: InputDecoration(labelText: 'Chủ đề (tùy chọn)', hintText: 'VD: Khuyến mãi mùa hè'),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.auto_awesome),
                label: const Text('Tạo chiến dịch bằng AI'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChannelChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _ChannelChip({required this.label, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: isSelected ? AppColors.primary : AppColors.divider),
        ),
        child: Text(label, style: TextStyle(
          color: isSelected ? Colors.white : AppColors.textSecondary,
          fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
        )),
      ),
    );
  }
}
