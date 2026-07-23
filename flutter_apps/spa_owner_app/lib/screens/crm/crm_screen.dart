import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/formatters.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/widgets/empty_state_widget.dart';
import '../../bloc/crm/crm_bloc.dart';
import '../../bloc/crm/crm_event.dart';
import '../../bloc/crm/crm_state.dart';
import '../../widgets/customer_card.dart';
import '../../widgets/customer_filter_sheet.dart';
import '../../widgets/stat_item.dart';
import '../../widgets/info_section.dart';
import '../../widgets/info_item.dart';
import '../../widgets/service_history_item.dart';
import '../../widgets/purchase_history_item.dart';
import '../../widgets/skin_record_card.dart';
import '../../widgets/ai_insight_card.dart';

class CrmScreen extends StatefulWidget {
  const CrmScreen({super.key});

  @override
  State<CrmScreen> createState() => _CrmScreenState();
}

class _CrmScreenState extends State<CrmScreen>
    with SingleTickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  String _selectedSegment = 'all';
  bool _isSearching = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();

    _tabController.addListener(() {
      if (_tabController.indexIsChanging) {
        final segments = ['all', 'vip', 'dormant', 'at_risk'];
        setState(() {
          _selectedSegment = segments[_tabController.index];
        });
        _loadData();
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _loadData() {
    context.read<CrmBloc>().add(LoadCustomersEvent(
      segment: _selectedSegment,
      search: _searchController.text.trim().isEmpty ? null : _searchController.text.trim(),
    ));
    context.read<CrmBloc>().add(const LoadCustomerStatsEvent());
  }

  void _onSearchSubmitted(String query) {
    _loadData();
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() {
      _isSearching = false;
    });
    _loadData();
  }

  void _navigateToCustomerDetail(String customerId) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => CustomerDetailScreen(customerId: customerId),
      ),
    ).then((_) => _loadData());
  }

  void _showAddCustomerDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Thêm khách hàng'),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Họ và tên',
                    prefixIcon: Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Số điện thoại',
                    prefixIcon: Icon(Icons.phone),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(Icons.email),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(
                    labelText: 'Nguồn giới thiệu',
                    prefixIcon: Icon(Icons.source),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'walk_in', child: Text('Khách tự đến')),
                    DropdownMenuItem(value: 'referral', child: Text('Giới thiệu')),
                    DropdownMenuItem(value: 'social_media', child: Text('Mạng xã hội')),
                    DropdownMenuItem(value: 'website', child: Text('Website')),
                    DropdownMenuItem(value: 'advertising', child: Text('Quảng cáo')),
                  ],
                  onChanged: (_) {},
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Hủy'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Thêm'),
          ),
        ],
      ),
    );
  }

  void _showFilterSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => CustomerFilterSheet(
        onApply: (filters) {
          context.read<CrmBloc>().add(FilterCustomersEvent(filters: filters));
          Navigator.pop(context);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'CRM 360',
          style: GoogleFonts.playfairDisplay(
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          indicatorWeight: 3,
          labelStyle: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            fontSize: 13,
          ),
          unselectedLabelStyle: GoogleFonts.inter(
            fontWeight: FontWeight.normal,
            fontSize: 13,
          ),
          tabs: const [
            Tab(text: 'Tất cả'),
            Tab(text: 'VIP'),
            Tab(text: 'Ngủ quên'),
            Tab(text: 'Sắp rời'),
          ],
        ),
      ),
      body: BlocConsumer<CrmBloc, CrmState>(
        listener: (context, state) {
          if (state is CrmError) {
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
              // Search Bar
              _buildSearchBar(),
              
              // Customer Stats
              _buildCustomerStats(state),

              // Customer List
              Expanded(
                child: _buildCustomerList(state),
              ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddCustomerDialog,
        icon: const Icon(Icons.person_add),
        label: const Text('Thêm khách'),
        backgroundColor: AppColors.primary,
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: TextField(
        controller: _searchController,
        onSubmitted: _onSearchSubmitted,
        decoration: InputDecoration(
          hintText: 'Tìm khách hàng...',
          hintStyle: GoogleFonts.inter(
            color: AppColors.textSecondary,
          ),
          prefixIcon: const Icon(Icons.search, color: AppColors.textSecondary),
          suffixIcon: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_searchController.text.isNotEmpty)
                IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: _clearSearch,
                ),
              IconButton(
                icon: const Icon(Icons.filter_list, color: AppColors.primary),
                onPressed: _showFilterSheet,
              ),
            ],
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          filled: true,
          fillColor: AppColors.surface,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
      ),
    );
  }

  Widget _buildCustomerStats(CrmState state) {
    if (state is! CustomerStatsLoaded) {
      return const SizedBox.shrink();
    }

    final stats = state.stats;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    '${stats.total}',
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: AppColors.primary,
                    ),
                  ),
                  Text(
                    'Tổng',
                    style: GoogleFonts.inter(
                      color: AppColors.textSecondary,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.success.withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    '${stats.newThisMonth}',
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: AppColors.success,
                    ),
                  ),
                  Text(
                    'Mới',
                    style: GoogleFonts.inter(
                      color: AppColors.textSecondary,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.accent.withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    '${stats.vip}',
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: AppColors.accent,
                    ),
                  ),
                  Text(
                    'VIP',
                    style: GoogleFonts.inter(
                      color: AppColors.textSecondary,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.warning.withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    '${stats.atRisk}',
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: AppColors.warning,
                    ),
                  ),
                  Text(
                    'Rời bỏ',
                    style: GoogleFonts.inter(
                      color: AppColors.textSecondary,
                      fontSize: 10,
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

  Widget _buildCustomerList(CrmState state) {
    if (state is CrmLoading && state.isInitial) {
      return const Center(child: LoadingWidget());
    }

    if (state is CrmError && state.isInitial) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 16),
            Text(
              state.message,
              style: GoogleFonts.inter(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadData,
              child: const Text('Thử lại'),
            ),
          ],
        ),
      );
    }

    final customers = state is CustomersLoaded ? state.customers : <dynamic>[];

    if (customers.isEmpty) {
      return const EmptyStateWidget(
        icon: Icons.people_outline,
        title: 'Chưa có khách hàng',
        message: 'Thêm khách hàng mới hoặc kết nối dữ liệu',
        actionLabel: 'Thêm khách hàng',
        onAction: _showAddCustomerDialog,
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: customers.length,
      itemBuilder: (context, index) {
        final customer = customers[index];
        return CustomerCard(
          customer: customer,
          onTap: () => _navigateToCustomerDetail(customer.id),
        );
      },
    );
  }

  static void _showAddCustomerDialog(BuildContext context) {
    // Implementation
  }
}

// ==========================================
// CUSTOMER DETAIL SCREEN
// ==========================================
class CustomerDetailScreen extends StatefulWidget {
  final String customerId;

  const CustomerDetailScreen({
    super.key,
    required this.customerId,
  });

  @override
  State<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends State<CustomerDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    context.read<CrmBloc>().add(LoadCustomerDetailEvent(customerId: widget.customerId));
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CrmBloc, CrmState>(
      builder: (context, state) {
        final customer = state is CustomerDetailLoaded ? state.customer : null;

        return Scaffold(
          appBar: AppBar(
            title: Text(
              customer?.fullName ?? 'Chi tiết khách hàng',
              style: GoogleFonts.playfairDisplay(
                fontSize: 20,
                fontWeight: FontWeight.w600,
              ),
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.edit_outlined),
                onPressed: () {},
              ),
              IconButton(
                icon: const Icon(Icons.more_vert),
                onPressed: () {},
              ),
            ],
            bottom: TabBar(
              controller: _tabController,
              isScrollable: true,
              labelColor: AppColors.primary,
              unselectedLabelColor: AppColors.textSecondary,
              indicatorColor: AppColors.primary,
              labelStyle: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
              unselectedLabelStyle: GoogleFonts.inter(
                fontWeight: FontWeight.normal,
                fontSize: 13,
              ),
              tabs: const [
                Tab(text: 'Hồ sơ'),
                Tab(text: 'Dịch vụ'),
                Tab(text: 'Mua hàng'),
                Tab(text: 'Da'),
                Tab(text: 'AI'),
              ],
            ),
          ),
          body: state is CrmLoading
              ? const Center(child: CircularProgressIndicator())
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _ProfileTab(customer: customer),
                    const _ServiceHistoryTab(),
                    const _PurchaseHistoryTab(),
                    const _SkinRecordsTab(),
                    const _AiInsightsTab(),
                  ],
                ),
        );
      },
    );
  }
}

// ==========================================
// PROFILE TAB
// ==========================================
class _ProfileTab extends StatelessWidget {
  final dynamic customer;

  const _ProfileTab({this.customer});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Avatar and basic info
          CircleAvatar(
            radius: 48,
            backgroundColor: AppColors.primary.withOpacity(0.1),
            child: customer?.avatarUrl != null
                ? ClipOval(
                    child: CachedNetworkImage(
                      imageUrl: customer.avatarUrl,
                      width: 96,
                      height: 96,
                      fit: BoxFit.cover,
                    ),
                  )
                : Icon(
                    Icons.person,
                    size: 48,
                    color: AppColors.primary,
                  ),
          ),
          const SizedBox(height: 16),
          Text(
            customer?.fullName ?? 'Khách hàng',
            style: GoogleFonts.inter(
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: _getTierColor(customer?.membershipTier).withOpacity(0.2),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              customer?.membershipTier ?? 'Member',
              style: TextStyle(
                color: _getTierColor(customer?.membershipTier),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Stats
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              StatItem(
                label: 'Tổng chi tiêu',
                value: AppFormatters.currency(customer?.totalSpent ?? 0),
              ),
              StatItem(
                label: 'Lượt đến',
                value: '${customer?.visitCount ?? 0}',
              ),
              StatItem(
                label: 'Điểm',
                value: '${customer?.loyaltyPoints ?? 0}',
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Contact info
          InfoSection(
            title: 'Thông tin liên hệ',
            items: [
              InfoItem(
                icon: Icons.phone,
                label: 'Điện thoại',
                value: customer?.phone ?? '-',
              ),
              InfoItem(
                icon: Icons.email,
                label: 'Email',
                value: customer?.email ?? '-',
              ),
              InfoItem(
                icon: Icons.cake,
                label: 'Ngày sinh',
                value: customer?.dateOfBirth ?? '-',
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Skin info
          InfoSection(
            title: 'Thông tin da',
            items: [
              InfoItem(
                icon: Icons.face,
                label: 'Loại da',
                value: customer?.skinType ?? '-',
              ),
              InfoItem(
                icon: Icons.warning_amber,
                label: 'Vấn đề da',
                value: customer?.skinConcerns?.join(', ') ?? '-',
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Tags
          if (customer?.tags != null && customer.tags.isNotEmpty) ...[
            InfoSection(
              title: 'Tags',
              items: [
                InfoItem(
                  icon: Icons.label,
                  label: '',
                  value: customer.tags.join(', '),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Color _getTierColor(String tier) {
    switch (tier?.toLowerCase()) {
      case 'silver':
        return AppColors.silver;
      case 'gold':
        return AppColors.gold;
      case 'platinum':
        return const Color(0xFFE5E4E2);
      case 'diamond':
        return AppColors.diamond;
      default:
        return AppColors.textSecondary;
    }
  }
}

// ==========================================
// SERVICE HISTORY TAB
// ==========================================
class _ServiceHistoryTab extends StatelessWidget {
  const _ServiceHistoryTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CrmBloc, CrmState>(
      builder: (context, state) {
        if (state is CrmLoading && state.isInitial) {
          return const Center(child: LoadingWidget());
        }

        final services = state is CustomerDetailLoaded ? state.services : <dynamic>[];

        if (services.isEmpty) {
          return const EmptyStateWidget(
            icon: Icons.history,
            title: 'Chưa có lịch sử dịch vụ',
            message: 'Khách hàng chưa sử dụng dịch vụ nào',
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: services.length,
          itemBuilder: (context, index) {
            final service = services[index];
            return ServiceHistoryItem(service: service);
          },
        );
      },
    );
  }
}

// ==========================================
// PURCHASE HISTORY TAB
// ==========================================
class _PurchaseHistoryTab extends StatelessWidget {
  const _PurchaseHistoryTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CrmBloc, CrmState>(
      builder: (context, state) {
        if (state is CrmLoading && state.isInitial) {
          return const Center(child: LoadingWidget());
        }

        final purchases = state is CustomerDetailLoaded ? state.purchases : <dynamic>[];

        if (purchases.isEmpty) {
          return const EmptyStateWidget(
            icon: Icons.shopping_bag_outlined,
            title: 'Chưa có lịch sử mua hàng',
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: purchases.length,
          itemBuilder: (context, index) {
            final purchase = purchases[index];
            return PurchaseHistoryItem(purchase: purchase);
          },
        );
      },
    );
  }
}

// ==========================================
// SKIN RECORDS TAB
// ==========================================
class _SkinRecordsTab extends StatelessWidget {
  const _SkinRecordsTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CrmBloc, CrmState>(
      builder: (context, state) {
        if (state is CrmLoading && state.isInitial) {
          return const Center(child: LoadingWidget());
        }

        final records = state is CustomerDetailLoaded ? state.skinRecords : <dynamic>[];

        if (records.isEmpty) {
          return const EmptyStateWidget(
            icon: Icons.face_retouching_natural,
            title: 'Chưa có hồ sơ da',
            message: 'Chụp ảnh da để AI phân tích',
            actionLabel: 'Phân tích da',
            onAction: _navigateToSkinAnalysis,
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: records.length,
          itemBuilder: (context, index) {
            final record = records[index];
            return SkinRecordCard(record: record);
          },
        );
      },
    );
  }

  static void _navigateToSkinAnalysis(BuildContext context) {
    // Navigate to skin analysis
  }
}

// ==========================================
// AI INSIGHTS TAB
// ==========================================
class _AiInsightsTab extends StatelessWidget {
  const _AiInsightsTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CrmBloc, CrmState>(
      builder: (context, state) {
        if (state is CrmLoading && state.isInitial) {
          return const Center(child: LoadingWidget());
        }

        final insights = state is CustomerDetailLoaded ? state.aiInsights : null;

        if (insights == null) {
          return const EmptyStateWidget(
            icon: Icons.auto_awesome,
            title: 'AI Insights',
            message: 'AI sẽ phân tích hành vi khách hàng và đề xuất chiến lược',
          );
        }

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            AiInsightCard(
              title: 'Dự đoán rời bỏ',
              value: '${insights.churnRisk}%',
              description: 'Rủi ro khách hàng rời bỏ',
              color: insights.churnRisk > 50 ? AppColors.error : AppColors.success,
            ),
            const SizedBox(height: 12),
            AiInsightCard(
              title: 'Giá trị trọn đời',
              value: AppFormatters.currency(insights.lifetimeValue),
              description: 'Giá trị dự kiến khách hàng mang lại',
              color: AppColors.primary,
            ),
            const SizedBox(height: 12),
            AiInsightCard(
              title: 'Đề xuất chiến lược',
              value: insights.recommendedAction,
              description: 'Hành động nên thực hiện',
              color: AppColors.accent,
            ),
          ],
        );
      },
    );
  }
}