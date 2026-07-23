import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/widgets/empty_state_widget.dart';
import '../../bloc/ai/ai_hub_bloc.dart';
import '../../bloc/ai/ai_hub_event.dart';
import '../../bloc/ai/ai_hub_state.dart';
import '../../widgets/ai_status_banner.dart';
import '../../widgets/ai_module_card.dart';
import '../../widgets/knowledge_section.dart';
import '../../widgets/ai_chat_screen.dart';
import '../../widgets/ai_marketing_screen.dart';
import '../../widgets/ai_skin_analysis_screen.dart';
import '../../widgets/ai_prediction_screen.dart';

class AiHubScreen extends StatefulWidget {
  const AiHubScreen({super.key});

  @override
  State<AiHubScreen> createState() => _AiHubScreenState();
}

class _AiHubScreenState extends State<AiHubScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    context.read<AiHubBloc>().add(const LoadAiStatusEvent());
    context.read<AiHubBloc>().add(const LoadKnowledgeStatsEvent());
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'AI Spa Brain',
          style: GoogleFonts.playfairDisplay(
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => _navigateToAiSettings(context),
          ),
        ],
      ),
      body: BlocConsumer<AiHubBloc, AiHubState>(
        listener: (context, state) {
          if (state is AiHubError) {
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
          if (state is AiHubLoading && state.isInitial) {
            return const Center(
              child: LoadingWidget(message: 'Đang tải AI...'),
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // AI Status Banner
                AiStatusBanner(
                  status: state is AiStatusLoaded ? state.status : null,
                  onRefresh: () {
                    context.read<AiHubBloc>().add(const LoadAiStatusEvent());
                  },
                ),
                const SizedBox(height: 24),

                // AI Modules
                _buildAiModules(state),
                const SizedBox(height: 24),

                // Knowledge Base
                _buildKnowledgeBase(state),
                const SizedBox(height: 24),

                // Usage Stats
                _buildUsageStats(state),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showQuickActionDialog(context),
        icon: const Icon(Icons.auto_awesome),
        label: const Text('AI Quick Actions'),
        backgroundColor: const Color(0xFF667eea),
      ),
    );
  }

  Widget _buildAiModules(AiHubState state) {
    final modules = state is AiModulesLoaded ? state.modules : <dynamic>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'AI Modules',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            TextButton(
              onPressed: () => _navigateToAllModules(context),
              child: const Text('Xem tất cả'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.1,
          children: [
            AiModuleCard(
              icon: Icons.chat_bubble_outline,
              title: 'AI Sales Consultant',
              description: 'Tư vấn bán hàng, upsell, cross-sell',
              color: const Color(0xFF3498DB),
              isActive: true,
              onTap: () => _openAiChat(context, 'sales_consult'),
            ),
            AiModuleCard(
              icon: Icons.handshake_outlined,
              title: 'AI Closing Agent',
              description: 'Phân tích và kịch bản chốt sale',
              color: const Color(0xFFE74C3C),
              isActive: true,
              onTap: () => _openAiChat(context, 'closing'),
            ),
            AiModuleCard(
              icon: Icons.favorite_outline,
              title: 'AI Customer Success',
              description: 'Chăm sóc sau bán, tái khám',
              color: const Color(0xFF27AE60),
              isActive: true,
              onTap: () => _openAiChat(context, 'customer_success'),
            ),
            AiModuleCard(
              icon: Icons.campaign_outlined,
              title: 'AI Marketing',
              description: 'Tạo chiến dịch Facebook, TikTok, Zalo',
              color: const Color(0xFFF39C12),
              isActive: true,
              onTap: () => _navigateToMarketing(context),
            ),
            AiModuleCard(
              icon: Icons.face_retouching_natural,
              title: 'AI Skin Analysis',
              description: 'Phân tích da bằng AI',
              color: const Color(0xFF9B59B6),
              isActive: true,
              onTap: () => _navigateToSkinAnalysis(context),
            ),
            AiModuleCard(
              icon: Icons.trending_up,
              title: 'AI Prediction',
              description: 'Dự đoán doanh thu, churn risk',
              color: const Color(0xFF1ABC9C),
              isActive: false,
              onTap: () => _navigateToPrediction(context),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildKnowledgeBase(AiHubState state) {
    final stats = state is KnowledgeStatsLoaded ? state.stats : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Knowledge Base',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            TextButton(
              onPressed: () => _navigateToKnowledge(context),
              child: const Text('Quản lý'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        KnowledgeSection(
          title: 'Sản phẩm',
          description: 'AI đã học về sản phẩm của bạn',
          icon: Icons.shopping_bag,
          count: stats?.productCount ?? 0,
          onTap: () => _navigateToProductKnowledge(context),
        ),
        const SizedBox(height: 8),
        KnowledgeSection(
          title: 'Dịch vụ',
          description: 'AI đã học về dịch vụ của bạn',
          icon: Icons.spa,
          count: stats?.serviceCount ?? 0,
          onTap: () => _navigateToServiceKnowledge(context),
        ),
        const SizedBox(height: 8),
        KnowledgeSection(
          title: 'Tài liệu',
          description: 'PDF, DOCX, XLSX đã tải lên',
          icon: Icons.folder,
          count: stats?.documentCount ?? 0,
          onTap: () => _navigateToDocuments(context),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => _showUploadDialog(context),
          icon: const Icon(Icons.upload_file),
          label: const Text('Tải lên tài liệu đào tạo AI'),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildUsageStats(AiHubState state) {
    final usage = state is UsageStatsLoaded ? state.usage : null;

    if (usage == null) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'AI Usage',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.divider),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  children: [
                    Text(
                      '${usage.totalTokens}',
                      style: GoogleFonts.inter(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                    Text(
                      'Tokens',
                      style: GoogleFonts.inter(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 1,
                height: 40,
                color: AppColors.divider,
              ),
              Expanded(
                child: Column(
                  children: [
                    Text(
                      '${usage.totalMessages}',
                      style: GoogleFonts.inter(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppColors.success,
                      ),
                    ),
                    Text(
                      'Messages',
                      style: GoogleFonts.inter(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 1,
                height: 40,
                color: AppColors.divider,
              ),
              Expanded(
                child: Column(
                  children: [
                    Text(
                      AppFormatters.currency(usage.estimatedCost),
                      style: GoogleFonts.inter(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppColors.accent,
                      ),
                    ),
                    Text(
                      'Est. Cost',
                      style: GoogleFonts.inter(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ==========================================
  // NAVIGATION METHODS
  // ==========================================

  void _openAiChat(BuildContext context, String contextType) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AiChatScreen(contextType: contextType),
      ),
    );
  }

  void _navigateToMarketing(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const AiMarketingScreen(),
      ),
    );
  }

  void _navigateToSkinAnalysis(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const AiSkinAnalysisScreen(),
      ),
    );
  }

  void _navigateToPrediction(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const AiPredictionScreen(),
      ),
    );
  }

  void _navigateToAiSettings(BuildContext context) {
    Navigator.pushNamed(context, '/ai-settings');
  }

  void _navigateToAllModules(BuildContext context) {
    Navigator.pushNamed(context, '/ai-modules');
  }

  void _navigateToKnowledge(BuildContext context) {
    Navigator.pushNamed(context, '/ai-knowledge');
  }

  void _navigateToProductKnowledge(BuildContext context) {
    Navigator.pushNamed(context, '/ai-knowledge/products');
  }

  void _navigateToServiceKnowledge(BuildContext context) {
    Navigator.pushNamed(context, '/ai-knowledge/services');
  }

  void _navigateToDocuments(BuildContext context) {
    Navigator.pushNamed(context, '/ai-knowledge/documents');
  }

  void _showUploadDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Tải lên tài liệu'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Chọn loại tài liệu:'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                _UploadTypeChip(label: 'PDF', icon: Icons.picture_as_pdf),
                _UploadTypeChip(label: 'DOCX', icon: Icons.description),
                _UploadTypeChip(label: 'XLSX', icon: Icons.table_chart),
                _UploadTypeChip(label: 'TEXT', icon: Icons.text_fields),
                _UploadTypeChip(label: 'IMAGE', icon: Icons.image),
              ],
            ),
            const SizedBox(height: 16),
            const TextField(
              decoration: InputDecoration(
                labelText: 'Tiêu đề',
                prefixIcon: Icon(Icons.title),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.upload_file),
              label: const Text('Chọn file'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Hủy'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Tải lên'),
          ),
        ],
      ),
    );
  }

  void _showQuickActionDialog(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        child: Wrap(
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.divider,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'AI Quick Actions',
              style: GoogleFonts.playfairDisplay(
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.chat, color: AppColors.primary),
              title: const Text('Chat với AI Sales'),
              onTap: () {
                Navigator.pop(context);
                _openAiChat(context, 'sales_consult');
              },
            ),
            ListTile(
              leading: const Icon(Icons.face_retouching_natural, color: Color(0xFF9B59B6)),
              title: const Text('Phân tích da'),
              onTap: () {
                Navigator.pop(context);
                _navigateToSkinAnalysis(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.campaign, color: Color(0xFFF39C12)),
              title: const Text('Tạo chiến dịch marketing'),
              onTap: () {
                Navigator.pop(context);
                _navigateToMarketing(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.trending_up, color: Color(0xFF1ABC9C)),
              title: const Text('Xem dự đoán doanh thu'),
              onTap: () {
                Navigator.pop(context);
                _navigateToPrediction(context);
              },
            ),
          ],
        ),
      ),
    );
  }
}

// ==========================================
// UPLOAD TYPE CHIP
// ==========================================
class _UploadTypeChip extends StatelessWidget {
  final String label;
  final IconData icon;

  const _UploadTypeChip({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(label),
      avatar: Icon(icon, size: 16),
      backgroundColor: AppColors.surface,
      side: BorderSide(color: AppColors.divider),
    );
  }
}