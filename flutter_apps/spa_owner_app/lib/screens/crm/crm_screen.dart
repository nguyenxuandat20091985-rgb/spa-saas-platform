import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/formatters.dart';
import 'package:spa_shared/widgets/loading_widget.dart';

class CrmScreen extends StatefulWidget {
  const CrmScreen({super.key});

  @override
  State<CrmScreen> createState() => _CrmScreenState();
}

class _CrmScreenState extends State<CrmScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('CRM 360', style: GoogleFonts.playfairDisplay()),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          tabs: const [
            Tab(text: 'Tất cả'),
            Tab(text: 'VIP'),
            Tab(text: 'Ngủ quên'),
            Tab(text: 'Sắp rời'),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Tìm khách hàng...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(icon: const Icon(Icons.filter_list), onPressed: () {}),
              ),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _CustomerListView(segment: 'all'),
                _CustomerListView(segment: 'vip'),
                _CustomerListView(segment: 'dormant'),
                _CustomerListView(segment: 'at_risk'),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {},
        icon: const Icon(Icons.person_add),
        label: const Text('Thêm khách'),
      ),
    );
  }
}

class _CustomerListView extends StatelessWidget {
  final String segment;

  const _CustomerListView({required this.segment});

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.people_outline,
      title: 'Chưa có khách hàng',
      message: 'Thêm khách hàng mới hoặc kết nối dữ liệu',
      actionLabel: 'Thêm khách hàng',
    );
  }
}

class CustomerDetailScreen extends StatelessWidget {
  final String customerId;

  const CustomerDetailScreen({super.key, required this.customerId});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 5,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Chi tiết khách hàng'),
          bottom: const TabBar(
            isScrollable: true,
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.textSecondary,
            tabs: [
              Tab(text: 'Hồ sơ'),
              Tab(text: 'Dịch vụ'),
              Tab(text: 'Mua hàng'),
              Tab(text: 'Da'),
              Tab(text: 'AI'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _ProfileTab(),
            _ServiceHistoryTab(),
            _PurchaseHistoryTab(),
            _SkinRecordsTab(),
            _AiInsightsTab(),
          ],
        ),
      ),
    );
  }
}

class _ProfileTab extends StatelessWidget {
  const _ProfileTab();

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Avatar and basic info
          const CircleAvatar(radius: 48, child: Icon(Icons.person, size: 48)),
          const SizedBox(height: 16),
          Text('Khách hàng', style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.gold.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Text('Gold Member', style: TextStyle(color: AppColors.accent, fontWeight: FontWeight.w600)),
          ),
          const SizedBox(height: 24),

          // Stats
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _StatItem(label: 'Tổng chi tiêu', value: AppFormatters.currency(0)),
              _StatItem(label: 'Lượt đến', value: '0'),
              _StatItem(label: 'Điểm', value: '0'),
            ],
          ),
          const SizedBox(height: 24),

          // Contact info
          const _InfoSection(title: 'Thông tin liên hệ', items: [
            _InfoItem(icon: Icons.phone, label: 'Điện thoại', value: '-'),
            _InfoItem(icon: Icons.email, label: 'Email', value: '-'),
            _InfoItem(icon: Icons.cake, label: 'Ngày sinh', value: '-'),
          ]),
          const SizedBox(height: 16),

          // Skin info
          const _InfoSection(title: 'Thông tin da', items: [
            _InfoItem(icon: Icons.face, label: 'Loại da', value: '-'),
            _InfoItem(icon: Icons.warning_amber, label: 'Vấn đề da', value: '-'),
          ]),
        ],
      ),
    );
  }
}

class _ServiceHistoryTab extends StatelessWidget {
  const _ServiceHistoryTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.history,
      title: 'Chưa có lịch sử dịch vụ',
    );
  }
}

class _PurchaseHistoryTab extends StatelessWidget {
  const _PurchaseHistoryTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.shopping_bag_outlined,
      title: 'Chưa có lịch sử mua hàng',
    );
  }
}

class _SkinRecordsTab extends StatelessWidget {
  const _SkinRecordsTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.face_retouching_natural,
      title: 'Chưa có hồ sơ da',
      message: 'Chụp ảnh da để AI phân tích',
      actionLabel: 'Phân tích da',
    );
  }
}

class _AiInsightsTab extends StatelessWidget {
  const _AiInsightsTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.auto_awesome,
      title: 'AI Insights',
      message: 'AI sẽ phân tích hành vi khách hàng và đề xuất chiến lược',
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;

  const _StatItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.primary)),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      ],
    );
  }
}

class _InfoSection extends StatelessWidget {
  final String title;
  final List<_InfoItem> items;

  const _InfoSection({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(children: items),
        ),
      ],
    );
  }
}

class _InfoItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoItem({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.textSecondary),
          const SizedBox(width: 12),
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
        ],
      ),
    );
  }
}
